/**
 * Foundation Unit Test Suite (`node --test tests/core.test.mjs`).
 *
 * Uses Node's built-in `node:test`, `node:module` (`registerHooks`), and the
 * workspace's existing `typescript` package to import & test REAL production
 * modules from `src/` directly — zero extra npm dependencies required.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

/* ---------- Lightweight In-Memory Native Shims for Pure Node Testing ---------- */

const memoryStorage = new Map();
const revokedUrls = [];

globalThis.__DEV__ = false;

const originalRevokeObjectURL = URL.revokeObjectURL;
URL.revokeObjectURL = (uri) => {
  revokedUrls.push(uri);
  if (typeof originalRevokeObjectURL === 'function') {
    try {
      originalRevokeObjectURL(uri);
    } catch {
      // Ignore synthetic blob URLs in Node tests.
    }
  }
};

const VIRTUAL_PREFIX = 'virtual-shim:';

const VIRTUAL_SHIMS = {
  'react-native': `
    export const Platform = { OS: 'web', select: (obj) => obj.web ?? obj.default };
    export const AppState = {
      currentState: 'active',
      addEventListener: () => ({ remove() {} }),
    };
    export const Share = { share: async () => ({ action: 'sharedAction' }) };
  `,
  '@react-native-async-storage/async-storage': `
    const store = globalThis.__TEST_ASYNC_STORAGE__;
    const AsyncStorage = {
      getItem: async (k) => (store.has(k) ? store.get(k) : null),
      setItem: async (k, v) => { store.set(k, String(v)); },
      removeItem: async (k) => { store.delete(k); },
      clear: async () => { store.clear(); },
    };
    export default AsyncStorage;
  `,
  'expo-crypto': `
    import { randomBytes } from 'node:crypto';
    export function getRandomBytes(length) {
      return new Uint8Array(randomBytes(length));
    }
  `,
  'expo-file-system': `
    export const Paths = { cache: '/tmp' };
    export class File {
      constructor(...parts) { this.uri = parts.join('/'); }
      create() {}
      async write() {}
      async base64() { return ''; }
    }
  `,
  'expo-sharing': `
    export async function isAvailableAsync() { return false; }
    export async function shareAsync() {}
  `,
  'expo-auth-session': `
    export function makeRedirectUri() { return 'app10t4://auth-callback'; }
  `,
  'react-native-url-polyfill/auto': `export {};`,
};

globalThis.__TEST_ASYNC_STORAGE__ = memoryStorage;

function resolveTsFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.prototype.hasOwnProperty.call(VIRTUAL_SHIMS, specifier)) {
      return { url: `${VIRTUAL_PREFIX}${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith('@/')) {
      const target = resolveTsFile(path.join(SRC_DIR, specifier.slice(2)));
      if (target) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const target = resolveTsFile(path.resolve(parentDir, specifier));
      if (target) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(VIRTUAL_PREFIX)) {
      const key = url.slice(VIRTUAL_PREFIX.length);
      return { format: 'module', source: VIRTUAL_SHIMS[key], shortCircuit: true };
    }
    if (url.startsWith('file://') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
      const filePath = fileURLToPath(url);
      const raw = fs.readFileSync(filePath, 'utf8');
      const transpiled = ts.transpileModule(raw, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          verbatimModuleSyntax: false,
        },
      });
      return { format: 'module', source: transpiled.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

/* ---------- Load Real Production Modules ---------- */

const { freshState } = await import('@/store/persist');
const { mergeClassStates } = await import('@/store/remote');
const { computeOfficerPermissions } = await import('@/lib/officer-roles');
const { buildStudyParticipationStats, statsFor } = await import('@/lib/stats');
const { STUDY_STAMP_POINTS } = await import('@/constants/entry-meta');
const {
  hashPasswordV2,
  sha256HexPure,
  verifyPasswordHash,
  verifyPasswordHashSync,
} = await import('@/lib/password-crypto');
const {
  PRO_MAX_ATTEMPTS,
  getProLockoutRemainingMs,
  isProVaultUnlocked,
  lockProVault,
  verifyProVaultCredential,
} = await import('@/lib/pro-vault');
const { escapeCsvCell } = await import('@/lib/export');
const { isSafeHttpUrl, sanitizeHttpUrl } = await import('@/lib/url-safety');
const {
  cacheLocalPreviewUri,
  evictLocalPreviewUri,
  getLocalPreviewUri,
  revokeAllLocalPreviewUris,
} = await import('@/lib/drive');
const { isAccountTombstoned, isBeforeResetEpoch } = await import('@/lib/account-core');
const { buildWeeklyZaloReport } = await import('@/lib/weekly-zalo-report');

/* ---------- 1. Cloud Merge & Announcement Privacy / Replies / Pinned ---------- */

describe('mergeClassStates & announcement merging (src/store/remote.ts)', () => {
  it('preserves newer visibility & pinned updates across devices without stale overwrite', () => {
    const base = freshState();
    const olderPublic = {
      id: 'ann-priv-1',
      title: 'Họp Ban cán sự',
      content: 'Thảo luận nội bộ',
      tag: 'important',
      eventDate: null,
      pinned: false,
      likes: 2,
      author: 'GVCN',
      visibility: 'public',
      visibleToStudentIds: [],
      acknowledgedBy: ['stu-1'],
      replies: [
        {
          id: 'rep-1',
          authorName: 'An',
          authorRole: 'student',
          content: 'Em đã rõ',
          createdAt: '2026-11-26T08:00:00.000Z',
        },
        {
          id: 'rep-deleted',
          authorName: 'Bình',
          authorRole: 'student',
          content: 'Tin đã xoá',
          createdAt: '2026-11-26T08:05:00.000Z',
        },
      ],
      createdAt: '2026-11-26T07:00:00.000Z',
      updatedAt: '2026-11-26T07:00:00.000Z',
    };

    const newerSelectedPinned = {
      ...olderPublic,
      pinned: true,
      likes: 5,
      visibility: 'selected',
      visibleToStudentIds: ['stu-1', 'stu-2', 'stu-1'],
      acknowledgedBy: ['stu-2'],
      replies: [
        {
          id: 'rep-2',
          authorName: 'Chi',
          authorRole: 'officer',
          content: 'Đã nhận lịch',
          createdAt: '2026-11-26T08:10:00.000Z',
        },
      ],
      updatedAt: '2026-11-26T09:00:00.000Z',
    };

    const remoteState = {
      ...base,
      announcements: [newerSelectedPinned],
      deletedItemIds: { 'rep-deleted': '2026-11-26T09:05:00.000Z' },
    };
    const localState = {
      ...base,
      announcements: [olderPublic],
      deletedItemIds: {},
    };

    // Even when `prefer: 'local'`, newer `updatedAt` wins visibility & pinned!
    const merged = mergeClassStates(remoteState, localState, { prefer: 'local' });
    const mergedAnn = merged.announcements.find((a) => a.id === 'ann-priv-1');

    assert.ok(mergedAnn);
    assert.equal(mergedAnn.visibility, 'selected');
    assert.deepEqual(mergedAnn.visibleToStudentIds, ['stu-1', 'stu-2']);
    assert.equal(mergedAnn.pinned, true);
    assert.equal(mergedAnn.likes, 5);
    assert.deepEqual(new Set(mergedAnn.acknowledgedBy), new Set(['stu-1', 'stu-2']));
    assert.deepEqual(
      mergedAnn.replies.map((r) => r.id),
      ['rep-1', 'rep-2'],
      'Tombstoned reply must stay deleted and surviving replies must sort ascending',
    );
  });

  it('never collides distinct user posts with attachments and default title', () => {
    const base = freshState();
    const postA = {
      id: 'ann-photo-a',
      title: 'Chia sẻ ảnh / tệp tin',
      content: '',
      tag: 'event',
      eventDate: null,
      pinned: false,
      likes: 0,
      author: 'Minh',
      authorStudentId: 'stu-1',
      visibility: 'private',
      attachments: [
        {
          id: 'drv-a',
          name: 'a.jpg',
          url: 'https://drive.google.com/file/d/drv-a/view',
          kind: 'photo',
        },
      ],
      createdAt: '2026-11-26T10:00:00.000Z',
    };
    const postB = {
      ...postA,
      id: 'ann-photo-b',
      attachments: [
        {
          id: 'drv-b',
          name: 'b.jpg',
          url: 'https://drive.google.com/file/d/drv-b/view',
          kind: 'photo',
        },
      ],
      createdAt: '2026-11-26T10:05:00.000Z',
    };

    const merged = mergeClassStates(
      { ...base, announcements: [postA] },
      { ...base, announcements: [postB] },
      { prefer: 'remote' },
    );
    const ids = merged.announcements.map((a) => a.id);
    assert.ok(ids.includes('ann-photo-a'));
    assert.ok(ids.includes('ann-photo-b'));
  });
});

/* ---------- 2. Officer Roles RBAC ---------- */

describe('computeOfficerPermissions (src/lib/officer-roles.ts)', () => {
  it('grants announcement posting to ALL GVCN-assigned positions and blocks regular students', () => {
    const officerPositions = [
      ['Lớp trưởng'],
      ['Lớp phó lao động'],
      ['Tổ trưởng'],
      ['Thủ quỹ lớp (Tự ghi)'],
    ];

    for (const positions of officerPositions) {
      const perms = computeOfficerPermissions({
        isTeacher: false,
        isSubjectTeacher: false,
        memberRole: 'student',
        currentStudent: { id: 'stu-1', positions, group: 'Tổ 1' },
      });
      assert.equal(perms.isOfficer, true);
      assert.equal(
        perms.canPostAnnouncements,
        true,
        `Position ${positions[0]} must be allowed to post announcements`,
      );
      assert.equal(perms.canRecordStudy, true);
      assert.equal(perms.canRecordStudyForStudent({ id: 'stu-2', group: 'Tổ 1' }), true);
      assert.equal(perms.canRecordStudyForStudent({ id: 'stu-3', group: 'Tổ 2' }), false);
    }

    const regular = computeOfficerPermissions({
      isTeacher: false,
      isSubjectTeacher: false,
      memberRole: 'student',
      currentStudent: { id: 'stu-9', positions: [], position: null, group: 'Tổ 1' },
    });
    assert.equal(regular.isOfficer, false);
    assert.equal(regular.canPostAnnouncements, false);
    assert.equal(regular.canRecordStudy, false);
    assert.equal(regular.canRecordStudyForStudent({ id: 'stu-2', group: 'Tổ 1' }), false);
  });

  it('grants class-wide stamp permission to GVCN & explicit record_study grant', () => {
    const teacher = computeOfficerPermissions({
      isTeacher: true,
      isSubjectTeacher: false,
      memberRole: 'teacher',
      currentStudent: null,
    });
    assert.equal(teacher.canRecordStudyClassWide, true);
    assert.equal(teacher.canRecordStudyForStudent({ id: 'stu-x', group: 'Tổ 4' }), true);
    assert.equal(teacher.canPostAnnouncements, true);
  });
});

/* ---------- 3. Study Stamp Stats (0.25đ/stamp, Weekly vs HK I, Zero Crossover) ---------- */

describe('statsFor & buildStudyParticipationStats (src/lib/stats.ts)', () => {
  it('computes 1 stamp = 0.25đ accurately across weeks & HK I with zero achievement crossover', () => {
    assert.equal(STUDY_STAMP_POINTS, 0.25);

    const students = [
      { id: 's1', name: 'Nguyễn An', code: '10T4-01', group: 'Tổ 1' },
      { id: 's2', name: 'Trần Bình', code: '10T4-02', group: 'Tổ 2' },
    ];
    const entries = [
      {
        id: 'e1',
        studentId: 's1',
        title: 'Phát biểu Toán',
        kind: 'study',
        category: 'study',
        level: 'class',
        date: '2026-10-06',
        description: null,
        proofUrl: null,
        points: 0.25,
        status: 'approved',
        submittedBy: 'student',
        reviewNote: null,
        subject: 'Toán',
        speechCount: 1,
        createdAt: '2026-10-06T08:00:00.000Z',
        updatedAt: '2026-10-06T08:00:00.000Z',
      },
      {
        id: 'e2',
        studentId: 's1',
        title: 'Phát biểu Vật lý',
        kind: 'study',
        category: 'study',
        level: 'class',
        date: '2026-10-14',
        description: null,
        proofUrl: null,
        points: 0.5,
        status: 'approved',
        submittedBy: 'student',
        reviewNote: null,
        subject: 'Vật lý',
        speechCount: 2,
        createdAt: '2026-10-14T08:00:00.000Z',
        updatedAt: '2026-10-14T08:00:00.000Z',
      },
      {
        id: 'e3',
        studentId: 's1',
        title: 'Giải Nhất HSG Tin học',
        kind: 'achievement',
        category: 'academic',
        level: 'city',
        date: '2026-10-14',
        description: null,
        proofUrl: null,
        points: 20,
        status: 'approved',
        submittedBy: 'teacher',
        reviewNote: null,
        createdAt: '2026-10-14T09:00:00.000Z',
        updatedAt: '2026-10-14T09:00:00.000Z',
      },
    ];

    const stuStats = statsFor(entries, 's1');
    assert.equal(stuStats.studySpeeches, 3);
    assert.equal(stuStats.studyPoints, 0.75);
    assert.equal(stuStats.achievements, 1);
    assert.equal(stuStats.academicAchievements, 1);
    assert.equal(stuStats.points, 20.75);

    const report = buildStudyParticipationStats({
      entries,
      students,
      selectedWeekStart: '2026-10-12',
      semester1Start: '2026-09-05',
      semester1End: '2027-01-15',
    });

    assert.equal(report.weekly.totalSpeeches, 2);
    assert.equal(report.weekly.totalPoints, 0.5);
    assert.equal(report.semester1.totalSpeeches, 3);
    assert.equal(report.semester1.totalPoints, 0.75);
    assert.equal(report.studentRows[0].studentId, 's1');
    assert.equal(report.studentRows[0].hk1Speeches, 3);
    assert.equal(report.studentRows[0].weeklySpeeches, 2);
  });
});

/* ---------- 4. Password Crypto & Pro Vault ---------- */

describe('password-crypto.ts & pro-vault.ts', () => {
  it('hashes with CSPRNG PBKDF2-SHA256, verifies exact password, and upgrades legacy SHA-256', async () => {
    const hash1 = await hashPasswordV2('TestPass#2026');
    const hash2 = await hashPasswordV2('TestPass#2026');
    assert.ok(hash1.startsWith('pbkdf2_sha256$'));
    assert.notEqual(hash1, hash2, 'CSPRNG salt must differ across identical passwords');

    const okRes = await verifyPasswordHash('TestPass#2026', hash1);
    assert.deepEqual(okRes, { ok: true, needsRehash: false });

    const wrongRes = await verifyPasswordHash('testpass#2026', hash1);
    assert.equal(wrongRes.ok, false);

    // Legacy `<salt>:<sha256>` format must still verify and flag `needsRehash: true`
    const legacySalt = 'legacy-salt-01';
    const legacyHash = `${legacySalt}:${sha256HexPure(`class10t4:${legacySalt}:OldSecret99`)}`;
    const legacyVerify = await verifyPasswordHash('OldSecret99', legacyHash);
    assert.deepEqual(legacyVerify, { ok: true, needsRehash: true });

    const syncOk = verifyPasswordHashSync('OldSecret99', legacyHash);
    assert.equal(syncOk.ok, true);
  });

  it('rejects wrong Pro Vault credentials and enforces lockout after PRO_MAX_ATTEMPTS', async () => {
    memoryStorage.clear();
    lockProVault();
    assert.equal(isProVaultUnlocked(), false);

    const badPinFormat = await verifyProVaultCredential('pin', '123');
    assert.equal(badPinFormat.ok, false);

    let lastResult = null;
    for (let i = 0; i < PRO_MAX_ATTEMPTS; i += 1) {
      lastResult = await verifyProVaultCredential('pin', '0000000');
      assert.equal(lastResult.ok, false);
    }

    assert.ok(lastResult.lockedUntilMs > Date.now());
    assert.ok(getProLockoutRemainingMs() > 0);
    assert.equal(isProVaultUnlocked(), false);
    memoryStorage.clear();
  });
});

/* ---------- 5. CSV Formula Injection Defense ---------- */

describe('escapeCsvCell (src/lib/export.ts)', () => {
  it('neutralizes formula prefixes while preserving numeric and Vietnamese values', () => {
    assert.equal(
      escapeCsvCell('=HYPERLINK("https://evil.test","Open")'),
      `"'=HYPERLINK(""https://evil.test"",""Open"")"`,
    );
    assert.equal(escapeCsvCell('+1+1'), `'+1+1`);
    assert.equal(escapeCsvCell('-2+cmd|calc'), `'-2+cmd|calc`);
    assert.equal(escapeCsvCell('@SUM(A1:A5)'), `'@SUM(A1:A5)`);
    assert.equal(escapeCsvCell('\t=1+1'), `'\t=1+1`);
    assert.equal(escapeCsvCell('  =1+1'), `'  =1+1`);
    assert.equal(escapeCsvCell(-5), '-5');
    assert.equal(escapeCsvCell('-5'), '-5');
    assert.equal(escapeCsvCell('-0,25'), `"-0,25"`);
    assert.equal(escapeCsvCell('+0.25'), '+0.25');
    assert.equal(escapeCsvCell('Nguyễn Minh Quân'), 'Nguyễn Minh Quân');
  });
});

/* ---------- 6. URL Safety Sanitizer ---------- */

describe('url-safety.ts (isSafeHttpUrl & sanitizeHttpUrl)', () => {
  it('allows only valid http/https URLs and blocks dangerous schemes', () => {
    assert.equal(isSafeHttpUrl('https://drive.google.com/file/d/abc123/view'), true);
    assert.equal(isSafeHttpUrl('http://localhost:8081/test'), true);
    assert.equal(sanitizeHttpUrl('  https://example.com/doc.pdf  '), 'https://example.com/doc.pdf');

    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
    assert.equal(isSafeHttpUrl('JAVASCRIPT:void(0)'), false);
    assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeHttpUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
    assert.equal(isSafeHttpUrl('https://example.com/\nEvil'), false);
    assert.equal(sanitizeHttpUrl('javascript:alert(1)'), undefined);
  });
});

/* ---------- 7. Account Core & Blob URL Memory-Leak Revocation ---------- */

describe('account-core.ts & drive.ts blob lifecycle', () => {
  it('enforces reset epoch & tombstone predicates accurately', () => {
    const resetMs = Date.parse('2026-11-24T01:54:00.000Z');
    assert.equal(
      isBeforeResetEpoch('2026-11-23T23:00:00.000Z', '2026-11-20T00:00:00.000Z', resetMs),
      true,
    );
    assert.equal(
      isBeforeResetEpoch('2026-11-24T02:00:00.000Z', '2026-11-20T00:00:00.000Z', resetMs),
      false,
    );
    assert.equal(
      isAccountTombstoned(
        '2026-11-25T10:00:00.000Z',
        '2026-11-25T09:00:00.000Z',
        '2026-11-24T09:00:00.000Z',
      ),
      true,
    );
    assert.equal(
      isAccountTombstoned(
        '2026-11-25T08:00:00.000Z',
        '2026-11-25T09:00:00.000Z',
        '2026-11-24T09:00:00.000Z',
      ),
      false,
    );
  });

  it('revokes Web blob: URLs on replace, eviction, and bulk clear', () => {
    revokedUrls.length = 0;
    revokeAllLocalPreviewUris();
    revokedUrls.length = 0;

    cacheLocalPreviewUri('drv-1', 'blob:https://app/preview-1');
    assert.equal(getLocalPreviewUri('drv-1'), 'blob:https://app/preview-1');

    // Replacing drv-1 with a new blob must revoke the old blob
    cacheLocalPreviewUri('drv-1', 'blob:https://app/preview-2');
    assert.deepEqual(revokedUrls, ['blob:https://app/preview-1']);

    // Evicting drv-1 must revoke preview-2
    evictLocalPreviewUri('drv-1');
    assert.equal(getLocalPreviewUri('drv-1'), null);
    assert.deepEqual(revokedUrls, ['blob:https://app/preview-1', 'blob:https://app/preview-2']);
  });
});

/* ---------- 8. 1-Tap Weekly Zalo Class Summary Report ---------- */

describe('buildWeeklyZaloReport (src/lib/weekly-zalo-report.ts)', () => {
  it('aggregates attendance, duty, 0.25đ stamps, fund totals & upcoming tasks across both presets', () => {
    const base = freshState();
    const students = [
      {
        id: 'stu-1',
        name: 'Nguyễn An',
        code: '10T4-01',
        gender: 'male',
        birthDate: null,
        phone: null,
        email: null,
        address: null,
        group: 'Tổ 1',
        position: 'Lớp trưởng',
        positions: ['Lớp trưởng'],
        note: null,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      },
      {
        id: 'stu-2',
        name: 'Trần Bình',
        code: '10T4-02',
        gender: 'female',
        birthDate: null,
        phone: null,
        email: null,
        address: null,
        group: 'Tổ 2',
        position: null,
        positions: [],
        note: null,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      },
    ];

    const entries = [
      {
        id: 'st-1',
        studentId: 'stu-1',
        title: 'Phát biểu Toán',
        kind: 'study',
        category: 'study',
        level: 'class',
        date: '2026-10-13',
        description: null,
        proofUrl: null,
        points: 0.75,
        status: 'approved',
        submittedBy: 'student',
        reviewNote: null,
        subject: 'Toán',
        speechCount: 3,
        createdAt: '2026-10-13T08:00:00.000Z',
        updatedAt: '2026-10-13T08:00:00.000Z',
      },
      {
        id: 'st-prev',
        studentId: 'stu-2',
        title: 'Phát biểu Văn',
        kind: 'study',
        category: 'study',
        level: 'class',
        date: '2026-10-06',
        description: null,
        proofUrl: null,
        points: 0.25,
        status: 'approved',
        submittedBy: 'student',
        reviewNote: null,
        subject: 'Ngữ văn',
        speechCount: 1,
        createdAt: '2026-10-06T08:00:00.000Z',
        updatedAt: '2026-10-06T08:00:00.000Z',
      },
      {
        id: 'vio-1',
        studentId: 'stu-2',
        title: 'Quên thẻ học sinh',
        kind: 'violation',
        category: 'other',
        level: 'class',
        date: '2026-10-14',
        description: null,
        proofUrl: null,
        points: -2,
        status: 'approved',
        submittedBy: 'teacher',
        reviewNote: null,
        createdAt: '2026-10-14T08:00:00.000Z',
        updatedAt: '2026-10-14T08:00:00.000Z',
      },
    ];

    const sharedInput = {
      classInfo: {
        ...base.classInfo,
        name: '10T4',
        semester1Start: '2026-09-05',
        semester1End: '2027-01-15',
      },
      students,
      entries,
      attendance: {
        '2026-10-13': {
          date: '2026-10-13',
          records: {
            'stu-1': { status: 'present' },
            'stu-2': { status: 'absent' },
          },
          updatedAt: '2026-10-13T07:30:00.000Z',
        },
      },
      dutyLogs: {
        '2026-10-13': {
          date: '2026-10-13',
          assignedGroup: 'Tổ 1',
          assignedStudentIds: ['stu-1'],
          records: {
            'stu-1': { studentId: 'stu-1', status: 'completed' },
          },
          updatedAt: '2026-10-13T16:30:00.000Z',
        },
      },
      fundTransactions: [
        {
          id: 'tx-1',
          title: 'Thu quỹ HK I',
          kind: 'income',
          category: 'dues',
          amount: 500_000,
          date: '2026-10-12',
          note: null,
          createdAt: '2026-10-12T08:00:00.000Z',
        },
        {
          id: 'tx-2',
          title: 'Mua phấn bảng',
          kind: 'expense',
          category: 'supplies',
          amount: 120_000,
          date: '2026-10-14',
          note: null,
          createdAt: '2026-10-14T08:00:00.000Z',
        },
      ],
      fundPaid: { 'stu-1': true },
      tasks: [
        {
          id: 't-1',
          title: 'Nộp bài tập Toán Chương 2',
          subject: 'Toán',
          dueDate: '2026-10-18',
          priority: 'high',
          note: null,
          author: 'GV Toán',
          createdAt: '2026-10-13T08:00:00.000Z',
        },
      ],
      selectedWeekStart: '2026-10-12',
      referenceDate: '2026-10-14',
    };

    const parentReport = buildWeeklyZaloReport({ ...sharedInput, preset: 'parents' });
    assert.equal(parentReport.metrics.weeklySpeeches, 3);
    assert.equal(parentReport.metrics.weeklyStudyPoints, 0.75);
    assert.equal(parentReport.metrics.hk1Speeches, 4);
    assert.equal(parentReport.metrics.hk1StudyPoints, 1);
    assert.equal(parentReport.metrics.attendanceRate, 50);
    assert.equal(parentReport.metrics.dutyCompleted, 1);
    assert.equal(parentReport.metrics.fundIncome, 500_000);
    assert.equal(parentReport.metrics.fundExpense, 120_000);
    assert.equal(parentReport.metrics.fundBalance, 380_000);
    assert.equal(parentReport.metrics.violationCount, 1);
    assert.equal(parentReport.metrics.upcomingTasksCount, 1);
    assert.match(parentReport.text, /Kính gửi Quý Phụ huynh/);
    assert.match(parentReport.text, /380\.000 ₫/);
    assert.match(parentReport.text, /\+0,75đ/);
    assert.match(parentReport.text, /Nộp bài tập Toán Chương 2/);
    // Parent preset must NOT publicly name-shame the student for the violation
    assert.doesNotMatch(parentReport.text, /Quên thẻ học sinh/);

    const classReport = buildWeeklyZaloReport({ ...sharedInput, preset: 'class' });
    assert.match(classReport.text, /TỔNG KẾT TUẦN LỚP 10T4/);
    assert.match(classReport.text, /Top Stamp Tuần/);
    assert.match(classReport.text, /Nguyễn An/);
  });

  it('handles an empty week cleanly without NaN or crashes', () => {
    const base = freshState();
    const empty = buildWeeklyZaloReport({
      classInfo: base.classInfo,
      students: [],
      entries: [],
      attendance: {},
      dutyLogs: {},
      fundTransactions: [],
      tasks: [],
      selectedWeekStart: '2026-10-12',
      referenceDate: '2026-10-14',
      preset: 'parents',
    });

    assert.equal(empty.metrics.studentCount, 0);
    assert.equal(empty.metrics.attendanceRate, null);
    assert.equal(empty.metrics.weeklySpeeches, 0);
    assert.equal(empty.metrics.fundBalance, 0);
    assert.equal(empty.metrics.upcomingTasksCount, 0);
    assert.match(empty.text, /0 ₫/);
    assert.doesNotMatch(empty.text, /NaN/);
  });
});

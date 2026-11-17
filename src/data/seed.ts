/**
 * Seed data so the app is never empty on first run.
 *
 * Dates are relative to the current day, which keeps the demo looking alive
 * whenever it is opened.
 */

import { createId } from '@/lib/utils';
import type { ClassInfo, Entry, Student } from '@/types/models';

import { ENTRY_SEEDS_A } from './seed-entries-1';
import { ENTRY_SEEDS_B } from './seed-entries-2';

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** ISO day `daysAgo` days before today. */
function dayOffset(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function birthday(month: number, day: number, year = 2009): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

type Seed = {
  name: string;
  gender: Student['gender'];
  group: string;
  position?: string;
  birth: string;
};

const SEEDS: Seed[] = [
  { name: 'Nguyễn Minh Anh', gender: 'female', group: 'Tổ 1', position: 'Lớp trưởng', birth: birthday(3, 14) },
  
];

export const DEFAULT_CLASS: ClassInfo = {
  name: '10T4',
  school: 'THPT FPT',
  year: '2026 - 2027',
  teacherName: 'Ngô Vũ Hảo',
  motto: 'Học để biết, học để làm, học để cùng nhau trưởng thành.',
};

export function buildInitialStudents(): Student[] {
  const createdAt = new Date().toISOString();
  return SEEDS.map((seed, index) => ({
    id: createId('stu'),
    name: seed.name,
    code: `10T4-${String(index + 1).padStart(2, '0')}`,
    gender: seed.gender,
    birthDate: seed.birth,
    phone: null,
    email: null,
    address: null,
    group: seed.group,
    position: seed.position ?? null,
    note: null,
    createdAt,
    updatedAt: createdAt,
  }));
}

export function buildInitialEntries(students: Student[]): Entry[] {
  const createdAt = new Date().toISOString();
  return [...ENTRY_SEEDS_A, ...ENTRY_SEEDS_B].flatMap((seed) => {
    const student = students[seed.studentIndex];
    if (!student) return [];
    return [
      {
        id: createId('ent'),
        studentId: student.id,
        title: seed.title,
        kind: seed.kind,
        category: seed.category,
        level: seed.level,
        date: dayOffset(seed.daysAgo),
        description: seed.description ?? null,
        proofUrl: seed.proofUrl ?? null,
        points: seed.points,
        status: seed.status,
        submittedBy: seed.submittedBy ?? 'teacher',
        reviewNote: seed.reviewNote ?? null,
        createdAt,
        updatedAt: createdAt,
      },
    ];
  });
}

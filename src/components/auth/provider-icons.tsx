/**
 * Crisp brand & security SVG icons for the Class 10T4 Auth Portal.
 *
 * Uses `react-native-svg` so icons render razor-sharp at every pixel density
 * across iOS, Android, and Web without external asset network requests.
 */

import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type ProviderIconProps = {
  size?: number;
};

/** Official 4-color Google "G" mark. */
export function GoogleLogoIcon({ size = 20 }: ProviderIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export type GitHubLogoIconProps = {
  size?: number;
  color?: string;
};

/** Official GitHub Invertocat mark. */
export function GitHubLogoIcon({ size = 20, color = '#FFFFFF' }: GitHubLogoIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.64 3.01 8.58 7.18 9.97.53.1.72-.23.72-.51 0-.25-.01-1.08-.01-1.96-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.53-1.17-1.53-.95-.65.07-.64.07-.64 1.06.07 1.61 1.08 1.61 1.08.94 1.61 2.46 1.14 3.06.87.09-.68.37-1.14.67-1.41-2.33-.26-4.78-1.17-4.78-5.19 0-1.15.41-2.08 1.08-2.82-.11-.26-.47-1.33.1-2.78 0 0 .88-.28 2.89 1.08a10.1 10.1 0 0 1 2.63-.35c.89 0 1.79.12 2.63.35 2.01-1.36 2.89-1.08 2.89-1.08.57 1.45.21 2.52.1 2.78.67.74 1.08 1.67 1.08 2.82 0 4.03-2.46 4.92-4.8 5.18.38.33.71.97.71 1.95 0 1.41-.01 2.54-.01 2.89 0 .28.19.61.73.51A10.506 10.506 0 0 0 22.5 12c0-5.8-4.7-10.5-10.5-10.5z"
        fill={color}
      />
    </Svg>
  );
}

export type EmailShieldIconProps = {
  size?: number;
  primaryColor?: string;
  accentColor?: string;
  variant?: 'mail' | 'lock';
};

/** Bespoke themed mail-and-shield (or key-lock shield) emblem for verification & password recovery. */
export function EmailShieldIcon({
  size = 56,
  primaryColor = '#2F6BFF',
  accentColor = '#7C5CFF',
  variant = 'mail',
}: EmailShieldIconProps) {
  const gradId = variant === 'lock' ? 'lockShieldGrad' : 'mailShieldGrad';
  const badgeGradId = variant === 'lock' ? 'lockBadgeGrad' : 'mailBadgeGrad';

  if (variant === 'lock') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <Defs>
          <LinearGradient id={gradId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={primaryColor} />
            <Stop offset="1" stopColor={accentColor} />
          </LinearGradient>
          <LinearGradient id={badgeGradId} x1="36" y1="36" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#10B981" />
            <Stop offset="1" stopColor="#059669" />
          </LinearGradient>
        </Defs>
        {/* Outer security shield */}
        <Path
          d="M32 6L11 14.5V29.5C11 43.4 20 54.6 32 58C44 54.6 53 43.4 53 29.5V14.5L32 6Z"
          fill={`url(#${gradId})`}
          fillOpacity={0.14}
          stroke={`url(#${gradId})`}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        {/* Padlock shackle */}
        <Path
          d="M25 28V23.5C25 19.634 28.134 16.5 32 16.5C35.866 16.5 39 19.634 39 23.5V28"
          stroke={`url(#${gradId})`}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {/* Padlock body */}
        <Rect
          x="20"
          y="27"
          width="24"
          height="18"
          rx="5"
          fill={`url(#${gradId})`}
        />
        {/* Keyhole */}
        <Circle cx="32" cy="35" r="2.6" fill="#FFFFFF" />
        <Path d="M32 37.2V40.8" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
        {/* Verified check orb */}
        <Circle cx="48" cy="48" r="10" fill={`url(#${badgeGradId})`} />
        <Path
          d="M44 48.2L46.8 51L52.3 45.2"
          stroke="#FFFFFF"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <LinearGradient id={gradId} x1="6" y1="10" x2="56" y2="54" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={primaryColor} />
          <Stop offset="1" stopColor={accentColor} />
        </LinearGradient>
        <LinearGradient id={badgeGradId} x1="36" y1="34" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#10B981" />
          <Stop offset="1" stopColor="#059669" />
        </LinearGradient>
      </Defs>
      {/* Ambient soft pill backdrop */}
      <Rect
        x="6"
        y="12"
        width="46"
        height="34"
        rx="10"
        fill={`url(#${gradId})`}
        fillOpacity={0.14}
        stroke={`url(#${gradId})`}
        strokeWidth={2.2}
      />
      {/* Envelope flap */}
      <Path
        d="M10.5 17.5L29 31.5L47.5 17.5"
        stroke={`url(#${gradId})`}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Subtle lower fold accents */}
      <Path
        d="M12 40.5L22 31.5M46 40.5L36 31.5"
        stroke={`url(#${gradId})`}
        strokeWidth={1.8}
        strokeOpacity={0.5}
        strokeLinecap="round"
      />
      {/* Security shield badge bottom-right */}
      <Path
        d="M47 32L37 36.2V43.8C37 50.6 41.3 56.1 47 58C52.7 56.1 57 50.6 57 43.8V36.2L47 32Z"
        fill={`url(#${badgeGradId})`}
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Path
        d="M43.2 44.8L45.9 47.5L51.2 41.8"
        stroke="#FFFFFF"
        strokeWidth={2.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}


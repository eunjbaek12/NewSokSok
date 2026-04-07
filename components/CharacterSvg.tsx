import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Path, Defs, LinearGradient, RadialGradient, Stop, G } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

export default function CharacterSvg({ size = 56, wave = true, isDark = false }: { size?: number; wave?: boolean; isDark?: boolean }) {
  const armRot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!wave) return;
    const timeout = setTimeout(() => {
      Animated.sequence([
        Animated.timing(armRot, { toValue: -35, duration: 180, useNativeDriver: false }),
        Animated.timing(armRot, { toValue: 10,  duration: 180, useNativeDriver: false }),
        Animated.timing(armRot, { toValue: -35, duration: 180, useNativeDriver: false }),
        Animated.timing(armRot, { toValue: 10,  duration: 180, useNativeDriver: false }),
        Animated.timing(armRot, { toValue: -35, duration: 180, useNativeDriver: false }),
        Animated.timing(armRot, { toValue: 0,   duration: 220, useNativeDriver: false }),
      ]).start();
    }, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Svg width={size} height={size} viewBox="0 0 250 250" fill="none">
      <Defs>
        <LinearGradient id="c_p0" x1="112.8" x2="112.8" y1="8.199" y2="235.2" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#97BC7B" offset="0" />
          <Stop stopColor="#729E56" offset="0.2135" />
          <Stop stopColor="#608C47" offset="0.3491" />
          <Stop stopColor="#527E3D" offset="0.6786" />
          <Stop stopColor="#3F6932" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p1" x1="32.56" x2="32.56" y1="123.7" y2="176.4" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#97BC7B" offset="0" />
          <Stop stopColor="#729E56" offset="0.2135" />
          <Stop stopColor="#608C47" offset="0.3491" />
          <Stop stopColor="#527E3D" offset="0.6786" />
          <Stop stopColor="#3F6932" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p2" x1="193" x2="193" y1="117" y2="176.3" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#638E4A" offset="0" />
          <Stop stopColor="#567C3E" offset="0.2135" />
          <Stop stopColor="#4E7238" offset="0.3491" />
          <Stop stopColor="#426430" offset="0.6786" />
          <Stop stopColor="#2E5022" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p3" x1="130.3" x2="130.3" y1="8.322" y2="37.55" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#97BC7B" offset="0" />
          <Stop stopColor="#729E56" offset="0.2135" />
          <Stop stopColor="#608C47" offset="0.3491" />
          <Stop stopColor="#527E3D" offset="0.6786" />
          <Stop stopColor="#3F6932" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p4" x1="128.9" x2="128.9" y1="12.51" y2="36.24" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#97BC7B" offset="0" />
          <Stop stopColor="#729E56" offset="0.2135" />
          <Stop stopColor="#608C47" offset="0.3491" />
          <Stop stopColor="#527E3D" offset="0.6786" />
          <Stop stopColor="#3F6932" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p5" x1="101.6" x2="101.6" y1="19.48" y2="36.7" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#97BC7B" offset="0" />
          <Stop stopColor="#729E56" offset="0.2135" />
          <Stop stopColor="#608C47" offset="0.3491" />
          <Stop stopColor="#527E3D" offset="0.6786" />
          <Stop stopColor="#3F6932" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p7" x1="113" x2="113" y1="37.7" y2="224.9" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#7A9E54" offset="0" />
          <Stop stopColor="#698B49" offset="0.1786" />
          <Stop stopColor="#5D7D40" offset="0.3491" />
          <Stop stopColor="#4E6D36" offset="0.6786" />
          <Stop stopColor="#335426" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p8" x1="112.8" x2="112.8" y1="46.2" y2="215.1" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#F0ED95" offset="0" />
          <Stop stopColor="#CDCD61" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p9" x1="112.7" x2="112.7" y1="128.8" y2="202.1" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#987048" offset="0" />
          <Stop stopColor="#644A2A" offset="1" />
        </LinearGradient>
        <RadialGradient id="c_p10" cx="0" cy="0" r="1" gradientTransform="translate(102.6 150.9) scale(50.93 47.02)" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#D6A083" offset="0" />
          <Stop stopColor="#BE835D" offset="0.4971" />
          <Stop stopColor="#895836" offset="1" />
        </RadialGradient>
        <RadialGradient id="c_p11" cx="0" cy="0" r="1" gradientTransform="translate(74.56 117.4) scale(10.57 7.38)" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E58875" offset="0" />
          <Stop stopColor="#DB7361" offset="1" />
        </RadialGradient>
        <RadialGradient id="c_p12" cx="0" cy="0" r="1" gradientTransform="translate(151.6 117.4) scale(11.04 7.278)" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E58875" offset="0" />
          <Stop stopColor="#DB7361" offset="1" />
        </RadialGradient>
        <LinearGradient id="c_p13" x1="90.57" x2="90.57" y1="93.71" y2="112.2" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#21160E" offset="0" />
          <Stop stopColor="#3A2618" offset="0.6342" />
          <Stop stopColor="#302014" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p14" x1="136.7" x2="136.7" y1="93.71" y2="112.3" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#21160E" offset="0" />
          <Stop stopColor="#3A2618" offset="0.6342" />
          <Stop stopColor="#302014" offset="1" />
        </LinearGradient>
        <LinearGradient id="c_p15" x1="113.5" x2="113.5" y1="112.3" y2="118" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#9F8764" offset="0" />
          <Stop stopColor="#67593F" offset="1" />
        </LinearGradient>
      </Defs>

      {/* 배경 장식 */}
      <Path d="m236.8 228.1-1.69 7.05-5.17 1.08 6.85 2.49 1.58 3.32 1.55-4.59 3.91-1.18-4.93-2.44-2.1-5.73z" fill={isDark ? '#2C2C2C' : '#E8E8E8'} />
      <Path d="m166.8 15.23-9.73 3.45 7.73 0.8 3.69-3.1-1.69-1.15z" fill={isDark ? '#333333' : '#F6F6F6'} />
      <Path d="m227.8 24.73-5.74-2.63-0.93 4.38 5.34 1.43 1.33-3.18z" fill={isDark ? '#2C2C2C' : '#E8E8E8'} />
      <Path d="m173.2 8.05-1.68 2.86 2.39 0.51 0.98-1.78-1.69-1.59z" fill={isDark ? '#333333' : '#F6F6F6'} />
      <Path d="m202 57.19-7.85 1.5-3.99 5.48 2.6 2.09 6.32-5.47 6.17-0.68-3.25-2.92z" fill={isDark ? '#2C2C2C' : '#E8E8E8'} />
      <Path d="m30.02 59.99 2.4 0.08 1.5 3.99v25.05l-3.38 13.38h5.47l-0.32-35.26-2.92-9.77-2.75 2.53z" fill={isDark ? '#333333' : '#F6F6F6'} />
      <Path d="m20.43 41.08 3.83 2.65 6.45-6.45h12.97v-4.15l-14.47 0.57-8.78 7.38z" fill={isDark ? '#333333' : '#F6F6F6'} />

      {/* 몸통 외곽 (그린) */}
      <Path d="m198 139.9c-5.91-11.11-15.94-21.8-16.91-23.81-7.25-19.09-10.19-52-35.85-68.73-10.91-7.16-19.17-9.47-31.07-9.94 14.56-1.36 30.22-11.63 33.96-26.81 0.61-2.46 0.14-1.95-0.37-2.4-0.75-0.67-13.76-1.22-21.33 3.27-8.46 5.06-12.76 14.35-13.57 22.54-1.7-6.95-8.93-16.07-22.69-16.6-1.8-0.07-0.54 2.54 0.19 4.73 4.21 12.55 15.51 14.86 20.37 15.37-18.25 0.16-30.07 7.54-42.81 21.01-13.3 14.27-19.85 39.08-23.98 58.51-7.58 9.96-19.78 24.13-23.1 41.71-1.93 9.74 2.83 18.21 10.3 18.21 2.44 0 4.52-0.97 4.52-0.97 2.36 9.85 7.91 22.3 20.91 32.75 6.69 5.53 8.12 15.98 17.32 22.96 5.78 4.54 17.82 4.03 22.68-0.27 2.4-2.22 4.09-6.27 5.29-6.27h24.35c2.67 3.78 3.44 8.83 15.12 9.91 12.84 0.58 18.36-9.98 24.11-22.98 3.12-5.64 18.22-14 23.71-35.94 0.61 0.33 1.67 0.81 3.89 0.81 9.07 0 14.38-15.87 4.96-37.06z" fill="url(#c_p0)" />

      {/* 왼쪽 팔 */}
      <Path d="m44.42 116.1c-7.05 9.48-19.9 24.75-23.13 42.64-1.5 8.31 1.79 16.31 8.37 17.39 3.95 0.64 6.72-2.03 6.72-2.03 1.63 1.2-1.26-0.82 0.56-9.16 2.67-12.18 2.94-32.8 7.48-48.84z" fill="url(#c_p1)" />

      {/* 머리 장식 (잎) */}
      <Path d="m113.1 37.41c-0.62-11.5 7.09-26.2 24.11-28.2 2.84-0.45 9.49-0.6 10-0.22 0.69 0.52-3.17 13.89-12.66 21.52-7.84 6.66-17.77 7.34-21.45 6.9z" fill="url(#c_p3)" />
      <Path d="m113.8 35.08c1.29-3.53 9.91-17.8 26.16-21.57 3.08-0.83 4.2-1.02 4.5-0.71 0.51 0.51-10.82 6.36-15.49 10.54-4.84 4.32-12.2 10.75-13.4 11.89-1.2 1.15-2.4 1.81-1.77-0.15z" fill="url(#c_p4)" />
      <Path d="m112.2 36.36c-0.97-5.09-6.86-14.6-18.18-16.19-1.93-0.32-3.19-0.74-3.03-0.2 0.31 1.05 7.81 7.54 10.93 9.82 3.74 2.72 9.01 5.94 9.66 6.42s0.8 0.89 0.62 0.15z" fill="url(#c_p5)" />

      {/* 몸통 외곽 (다크 그린) */}
      <Path d="m113.4 37.7c-18.38 0-31.93 7.69-43.37 20.38-13.79 15.53-18.92 35.89-25.61 57.99-4.02 12.86-7.72 37.74-7.72 45.56 0 29.02 22.21 63.28 76 63.28 41.1 0 76.25-23.86 76.9-60.58 0.25-13.67-5.46-33.82-9.58-46.61-7.33-23.38-11.87-49-33.32-67.3-10.62-8.79-20.55-12.72-33.3-12.72z" fill="url(#c_p7)" />

      {/* 몸통 (노란 배) */}
      <Path d="m113.4 46.2c-23.66 0-41.55 15.87-51.77 47.29-4.3 13.53-5.27 21.26-10.58 35.79-4.12 11.5-4.99 20.33-4.99 28.43 0 30.11 25.27 57.37 66.37 57.37 36.55 0 67.24-26.6 67.24-57.69 0-12.55-5.84-29.64-10.63-44.28-8.2-26-16.11-66.91-55.64-66.91z" fill="url(#c_p8)" />

      {/* 오른쪽 팔 (흔들기 애니메이션) — 몸통 위에 렌더링해서 연결부 자연스럽게 */}
      <AnimatedG rotation={armRot} originX={181.5} originY={113}>
        <Path d="m181.5 117c6.91 13.11 9.16 37.13 8.97 58.56 10.1 2.98 14.71-8.52 13.2-16.83-3.22-17.89-13.97-31.6-22.17-41.73z" fill="url(#c_p2)" />
      </AnimatedG>

      {/* 씨앗 (갈색 타원) */}
      <Path d="m113.2 201.6c19.84 0 35.55-16.88 35.55-34.12 0-19.14-15.71-38.15-36.03-38.15-19.99 0-36.05 16.56-36.05 38.09 0 18.3 15.64 34.18 36.53 34.18z" fill="url(#c_p9)" stroke="#6F5635" strokeMiterlimit={10} strokeWidth={1.142} />
      <Path d="m113.2 199.7c18.02 0 33.46-16.24 33.46-32.31 0-17.58-14.46-36.59-33.59-36.59-18.57 0-34.47 15.39-34.47 36.49 0 16.98 14.7 32.41 34.6 32.41z" fill="url(#c_p10)" />

      {/* 볼터치 */}
      <Path d="m73.75 110.1c-6.92 0-10.46 3.26-10.46 7.04 0 4.04 4.02 7.62 10.62 7.62 7.81 0 11.93-3.58 11.93-7.11s-4.43-7.55-12.09-7.55z" fill="url(#c_p11)" />
      <Path d="m151.9 110.2c-7.63 0-11.83 5.06-11.83 8.04 0 3.82 3.74 6.54 11.02 6.54s12.11-4.7 12.11-7.23c0-3.06-3.49-7.35-11.3-7.35z" fill="url(#c_p12)" />

      {/* 왼쪽 눈 */}
      <Path d="m90.09 93.71c-6.37 0-8.61 5.57-8.61 9 0 5.78 4.26 9.48 8.91 9.48 6.31 0 9.27-5.18 9.27-9.07 0-5.02-3.85-9.41-9.57-9.41z" fill="url(#c_p13)" />
      <Path d="m86.68 96.98c-2.23 1.25-2.17 3.98-0.87 4.78 1.67 1.05 3.72-0.07 4.1-1.7 0.56-2.37-1.45-4-3.23-3.08z" fill="#F6F6F6" />
      <Path d="m94.81 105.1c-1.2 0.66-1.16 2.22-0.44 2.67 0.99 0.62 2.19-0.06 2.41-1.01 0.33-1.33-0.81-2.25-1.97-1.66z" fill="#F6F6F6" />

      {/* 오른쪽 눈 */}
      <Path d="m136.7 93.71c-6.95 0-9.49 5.05-9.49 9.41 0 6.29 4.94 9.2 9.41 9.2 6.52 0 9.51-5.46 9.51-9.24 0-5.3-4.19-9.37-9.43-9.37z" fill="url(#c_p14)" />
      <Path d="m133.3 96.71c-2.43 0.7-2.89 3.41-1.77 4.56 1.43 1.5 3.67 0.75 4.37-0.78 1.01-2.33-0.62-4.38-2.6-3.78z" fill="#F6F6F6" />
      <Path d="m141.3 105.3c-1.32 0.77-1.07 2.2-0.35 2.65 1.05 0.62 2.25-0.19 2.51-1.07 0.48-1.58-1.08-2.27-2.16-1.58z" fill="#F6F6F6" />

      {/* 입 */}
      <Path d="m104.9 113.8c3.02 3.7 11.9 4.57 17.18-0.26" stroke="url(#c_p15)" strokeLinecap="round" strokeMiterlimit={10} strokeWidth={2.5} fill="none" />
    </Svg>
  );
}

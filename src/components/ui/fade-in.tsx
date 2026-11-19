import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

type FadeInProps = {
  children: ReactNode;
  /** Position in a staggered list; each step delays the entrance by 60ms. */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

/** Wraps content in a soft fade + rise entrance so screens feel alive. */
export function FadeIn({ children, index = 0, style }: FadeInProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 12) * 60)
        .duration(420)
        .springify()
        .damping(18)}
      style={style}>
      {children}
    </Animated.View>
  );
}

import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const Button = ({
  title,
  color = 'white',
  onPress = () => { },
  backgroundColor = COLORS.button,
  disabled = false,
  loading = false,
  textStyle,
  ...props
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: backgroundColor,
          opacity: disabled && !loading ? 0.5 : 1,
        },
        Platform.select({
          android: { elevation: disabled ? 0 : 4 },
          ios: disabled ? {} : {
            shadowColor: backgroundColor,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
          },
        }),
        props,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={color} animating={loading} />
      ) : (
        <Text style={[styles.title, { color: color }, textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 50,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  }
});

export default Button;

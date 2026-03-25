import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS } from '@constants/theme';

const RoundedScrollContainer = ({ children, backgroundColor = COLORS.white, borderRadius = true, scrollEnabled = true, style = {}, contentContainerStyle = {}, ...restProps }) => {

  const containerStyles = [
    { flex: 1, paddingHorizontal: 6, backgroundColor: backgroundColor },
    borderRadius ? { borderTopLeftRadius: 15, borderTopRightRadius: 15 } : {},
    style,
  ];

  const mergedContentStyle = [{ flexGrow: 1, padding: borderRadius ? 15 : 0 }, contentContainerStyle];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={containerStyles}>
        <ScrollView
          contentContainerStyle={mergedContentStyle}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          keyboardShouldPersistTaps="handled"
          {...restProps}
        >
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

export default RoundedScrollContainer;
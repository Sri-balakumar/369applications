import React from 'react';
import { Image, View } from 'react-native';
import { COLORS } from '@constants/theme';

/**
 * CustomerAvatar - Displays customer image or fallback icon
 * @param {string} imageBase64 - Base64 image data from Odoo (image_1920 field)
 * @param {number} width - Avatar width (default: 45)
 * @param {number} height - Avatar height (default: 45)
 * @param {number} borderRadius - Border radius (default: 22.5)
 */
const CustomerAvatar = ({ 
  imageBase64, 
  width = 45, 
  height = 45, 
  borderRadius = null,
  style = {} 
}) => {
  const radius = borderRadius || width / 2;

  // If image exists, display it
  if (imageBase64) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${imageBase64}` }}
        style={[
          {
            width,
            height,
            borderRadius: radius,
            backgroundColor: COLORS.lightGray,
          },
          style,
        ]}
      />
    );
  }

  // Fallback to default icon
  return (
    <Image
      source={require('@assets/icons/common/user_bg.png')}
      tintColor={COLORS.primaryThemeColor}
      style={[
        {
          width,
          height,
          borderRadius: radius,
        },
        style,
      ]}
    />
  );
};

export default CustomerAvatar;

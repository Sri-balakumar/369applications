import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';
import { MaterialIcons } from '@expo/vector-icons';

const ICON_MAP = {
  'Sales Order': 'shopping-cart',
  'Services': 'build',
  'Add Product': 'add-box',
};

const ImageContainer = ({ onPress, backgroundColor, title }) => (
  <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
    <View style={[styles.iconCircle, { backgroundColor: backgroundColor + '20' }]}>
      <MaterialIcons name={ICON_MAP[title] || 'apps'} size={26} color={backgroundColor} />
    </View>
    <Text style={styles.title} numberOfLines={1}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    textAlign: 'center',
  },
});

export default ImageContainer;

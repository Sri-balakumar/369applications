import React from 'react';
import { TouchableOpacity, Image, Text, StyleSheet, Platform, View } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const ListItem = ({ title, image, onPress }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconWrapper}>
        <Image source={image} style={styles.image} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    margin: 6,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 16,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  image: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default ListItem;

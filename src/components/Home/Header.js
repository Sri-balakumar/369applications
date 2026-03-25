import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const Header = () => {
  return (
    <View style={styles.container}>
      <Image
        source={require('@assets/images/Home/Header/header_transparent_bg.png')}
        style={styles.backgroundImage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundImage: {
    width: width * 0.5,
    aspectRatio: 3,
    resizeMode: 'contain',
  },
});

export default Header;

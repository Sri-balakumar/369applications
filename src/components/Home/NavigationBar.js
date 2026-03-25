import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FONT_FAMILY } from '@constants/theme';
import Text from '@components/Text';
import { TouchableHighlight } from 'react-native-gesture-handler';

const NavigationBar = ({ onSearchPress, onOptionsPress, onScannerPress }) => {
  return (
    <TouchableOpacity  activeOpacity={0.8} style={styles.container} onPress={onOptionsPress}>
      <TouchableOpacity onPress={onSearchPress}>
        <Image source={require('@assets/images/Home/Header/search.png')} style={styles.icon} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onOptionsPress}>
        <Text style={styles.text}>What are you looking for ?</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onScannerPress}>
        <Image source={require('@assets/images/Home/Header/barcode_scanner.png')} style={styles.icon} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2e294e',
    padding: 10,
    marginHorizontal: 20,
    borderRadius: 10,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  icon: {
    width: 20,
    height: 20,
    tintColor: 'white',
  },
  text: {
    color: 'white',
    fontFamily: FONT_FAMILY.urbanistLight,
  },
});

export default NavigationBar;

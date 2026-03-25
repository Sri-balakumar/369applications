
import { StyleSheet, Platform } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const styles = StyleSheet.create({

  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
      },
    }),
  },
  totalItemsText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginVertical: 8,
    color: '#333',
  },
  productContainer: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageWrapper: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
    marginRight: 14,
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 10,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  textInput: {
    width: 44,
    height: 32,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    marginHorizontal: 8,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    marginRight: 8,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
  },
  aedLabel: {
    fontSize: 14,
    marginLeft: 8,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
  },
  deleteButton: {
    padding: 8,
  },
  flatListContent: {
    paddingBottom: 10,
  },
  footerContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 8,
  },
  totalPriceContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  footerLabel: {
    fontSize: 15,
    color: '#555',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  totalPriceLabel: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBlack,
    color: COLORS.primaryThemeColor,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    alignItems: 'center',
  },
});


export default styles;

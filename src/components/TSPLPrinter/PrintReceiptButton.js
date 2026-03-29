import React, { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@components/common/Button';
import TSPLPrintSheet from './TSPLPrintSheet';

const PrintReceiptButton = ({ invoice, cashierName, currency, partnerPhone }) => {
  const [sheetVisible, setSheetVisible] = useState(false);

  if (!invoice) return null;

  return (
    <>
      <View style={{ marginTop: 10 }}>
        <Button
          backgroundColor="#7B2D8E"
          title="Print Label"
          onPress={() => setSheetVisible(true)}
        />
      </View>
      <TSPLPrintSheet
        isVisible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        invoice={invoice}
        cashierName={cashierName}
        currency={currency}
        partnerPhone={partnerPhone}
      />
    </>
  );
};

export default PrintReceiptButton;

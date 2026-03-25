import { useState, useCallback } from 'react';
import { getCurrentLocationWithAddress } from '@services/LocationTrackingService';

const usePaymentSignatureLocation = () => {
  const [signatureBase64, setSignatureBase64] = useState('');
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [locationData, setLocationData] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const captureLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const location = await getCurrentLocationWithAddress();
      setLocationData(location);
      return location;
    } catch (error) {
      console.error('[PaymentSignature] Location capture error:', error);
      return null;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  return {
    signatureBase64,
    setSignatureBase64,
    scrollEnabled,
    setScrollEnabled,
    locationData,
    locationLoading,
    captureLocation,
  };
};

export default usePaymentSignatureLocation;

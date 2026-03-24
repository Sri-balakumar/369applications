// src/store/currency/useCurrencyStore.js
import { create } from 'zustand';

const useCurrencyStore = create((set) => ({
    currency: 'AED',
    currencySymbol: 'AED',
    setCurrency: (packageName) => {
        let newCurrency = 'AED';

        if (packageName === process.env.EXPO_PUBLIC_PACKAGE_NAME_OMAN) {
            newCurrency = 'OMR';
        }

        set({ currency: newCurrency, currencySymbol: newCurrency });
    },
    setCurrencyDirect: (currencyCode) => {
        if (currencyCode) set({ currency: currencyCode });
    },
    setCurrencyFromOdoo: (data) => {
        if (data && data.code) set({ currency: data.code, currencySymbol: data.symbol || data.code });
    },
}));

export default useCurrencyStore;

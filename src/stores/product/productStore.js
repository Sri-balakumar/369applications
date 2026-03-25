import { create } from 'zustand';

const useProductStore = create((set, get) => ({
  currentCustomerId: null,
  cartItems: {}, // Object: {customerId: [...items]}
  
  // Set current customer
  setCurrentCustomer: (customerId) => set({ currentCustomerId: customerId }),
  
  // Get current customer's cart
  getCurrentCart: () => {
    const { currentCustomerId, cartItems } = get();
    return cartItems[currentCustomerId] || [];
  },
  
  // Backward compatibility - returns current customer's products
  get products() {
    return get().getCurrentCart();
  },
  
  addProduct: (product) => set((state) => {
    const { currentCustomerId } = state;
    if (!currentCustomerId) return state;
    
    const currentCart = state.cartItems[currentCustomerId] || [];
    const exists = currentCart.some((p) => p.id === product.id);
    
    if (!exists) {
      return {
        ...state,
        cartItems: {
          ...state.cartItems,
          [currentCustomerId]: [...currentCart, product]
        }
      };
    } else {
      const updatedCart = currentCart.map((p) =>
        p.id === product.id ? { ...p, quantity: product.quantity, price: product.price } : p
      );
      return {
        ...state,
        cartItems: {
          ...state.cartItems,
          [currentCustomerId]: updatedCart
        }
      };
    }
  }),
  
  removeProduct: (productId) => set((state) => {
    const { currentCustomerId } = state;
    if (!currentCustomerId) return state;
    
    const currentCart = state.cartItems[currentCustomerId] || [];
    return {
      ...state,
      cartItems: {
        ...state.cartItems,
        [currentCustomerId]: currentCart.filter((product) => product.id !== productId)
      }
    };
  }),
  
  clearProducts: () => set((state) => {
    const { currentCustomerId } = state;
    if (!currentCustomerId) return state;
    
    return {
      ...state,
      cartItems: {
        ...state.cartItems,
        [currentCustomerId]: []
      }
    };
  }),
  
  // Load customer cart (from API or localStorage)
  loadCustomerCart: (customerId, cartData) => set((state) => ({
    ...state,
    currentCustomerId: customerId,
    cartItems: {
      ...state.cartItems,
      [customerId]: cartData || []
    }
  })),
  
  // Set discount for a specific product in current cart
  setProductDiscount: (productId, discount) => set((state) => {
    const { currentCustomerId } = state;
    if (!currentCustomerId) return state;
    const currentCart = state.cartItems[currentCustomerId] || [];
    return {
      ...state,
      cartItems: {
        ...state.cartItems,
        [currentCustomerId]: currentCart.map(p =>
          p.id === productId ? { ...p, discount: discount } : p
        )
      }
    };
  }),

  // Clear all carts
  clearAllCarts: () => set({ cartItems: {}, currentCustomerId: null }),
}));

export default useProductStore;

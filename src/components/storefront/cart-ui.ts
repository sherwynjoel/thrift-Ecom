"use client";

import { create } from "zustand";

interface CartUIState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useCartUI = create<CartUIState>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

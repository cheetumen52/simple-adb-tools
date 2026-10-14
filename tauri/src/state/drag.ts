import { create } from "zustand";

export type DropTarget = "install" | "push" | null;

/** Which drop zone the OS-level file drag is currently over (native drops carry no DOM events). */
export const useDrag = create<{ over: DropTarget }>(() => ({ over: null }));

import { create } from 'zustand';
import { UserProfile } from '../hooks/useTelegramAuth';

interface AppState {
  profile: UserProfile | null;
  balance: number;
  activeTable: string | null;
  tables: { name: string; rowCount: number }[];
  selectedRowForDelete: { tableName: string; rowId: string } | null;
  selectedRowForEdit: { tableName: string; rowData: any } | null;

  setProfile: (profile: UserProfile | null) => void;
  updateBalance: (balance: number) => void;
  setTables: (tables: { name: string; rowCount: number }[] | ((prev: { name: string; rowCount: number }[]) => { name: string; rowCount: number }[])) => void;
  setActiveTable: (table: string | null) => void;
  setSelectedRowForDelete: (row: { tableName: string; rowId: string } | null) => void;
  setSelectedRowForEdit: (row: { tableName: string; rowData: any } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  balance: 0,
  activeTable: null,
  tables: [],
  selectedRowForDelete: null,
  selectedRowForEdit: null,

  setProfile: (profile) => set({
    profile,
    balance: profile?.balance ?? 0,
  }),
  updateBalance: (balance) => set({ balance }),
  setTables: (tablesOrUpdater) => set((state) => ({ 
    tables: typeof tablesOrUpdater === 'function' ? tablesOrUpdater(state.tables) : tablesOrUpdater 
  })),
  setActiveTable: (activeTable) => set({ activeTable }),
  setSelectedRowForDelete: (selectedRowForDelete) => set({ selectedRowForDelete }),
  setSelectedRowForEdit: (selectedRowForEdit) => set({ selectedRowForEdit })
}));

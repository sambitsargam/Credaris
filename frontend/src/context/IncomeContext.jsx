import React, { createContext, useContext, useState } from 'react';

// Holds the exact primitives from the last confirmed attest_income TX.
// Lives in memory only — reset on page refresh, no storage.
const IncomeContext = createContext(null);

export function IncomeProvider({ children }) {
  const [snapshot, setSnapshot] = useState(null);
  // snapshot shape: { verifiedIncome, txCount, avgIncome, periodStart, periodEnd }
  return (
    <IncomeContext.Provider value={{ snapshot, setSnapshot }}>
      {children}
    </IncomeContext.Provider>
  );
}

export function useIncomeSnapshot() {
  return useContext(IncomeContext);
}

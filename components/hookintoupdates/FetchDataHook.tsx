import { useContext } from "react";
import {
  FetchDataContext,
  type FetchDataContextValue,
} from "./FetchDataProvider";

export function useFetchData(): FetchDataContextValue {
  const context = useContext(FetchDataContext);

  if (context === undefined) {
    throw new Error("useFetchData must be used within a FetchDataProvider");
  }

  return context;
}

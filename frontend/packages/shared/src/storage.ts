// Tiny synchronous key-value storage built on expo-file-system (works in Expo
// Go and dev builds, unlike @react-native-async-storage/async-storage which
// needs a native module). Falls back to localStorage on web.

import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

function fileFor(key: string): File {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return new File(Paths.document, `${safeKey}.json`);
}

export function storageGet(key: string): string | null {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    const file = fileFor(key);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
    return;
  }
  try {
    fileFor(key).writeSync(value);
  } catch {
    // ignore
  }
}

export function storageRemove(key: string): void {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}

import { createAsyncThunk } from '@reduxjs/toolkit';
import { apiFetch } from '../lib/api';

/**
 * createAsyncThunk with the shared error handling every slice needs:
 * failures reject with the API's error envelope ({ code, message, details }),
 * so components can `unwrap()` and branch on `code`.
 */
export const apiThunk = (type, payloadCreator, options) =>
  createAsyncThunk(
    type,
    async (arg, thunkApi) => {
      try {
        return await payloadCreator(arg, { ...thunkApi, apiFetch });
      } catch (error) {
        return thunkApi.rejectWithValue({ status: error.status, code: error.code || 'UNKNOWN', message: error.message, details: error.details });
      }
    },
    options,
  );

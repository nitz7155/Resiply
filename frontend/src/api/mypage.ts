import apiClient from "./axios";

export type AddressResponse = {
  id: string;
  label: string;
  receiver: string;
  phone?: string | null;
  addressLine: string;
  deliveryType?: string | null;
  isDefault: boolean;
};

export type AddressCreatePayload = {
  member_id: number;
  label: string;
  receiver: string;
  phone?: string;
  addressLine: string;
  deliveryType?: string;
  isDefault?: boolean;
};

export type AddressUpdatePayload = {
  member_id: number;
  label?: string;
  receiver?: string;
  phone?: string;
  addressLine?: string;
  deliveryType?: string;
  isDefault?: boolean;
};

export const mypageApi = {
  getAddresses: (memberId: number) =>
    apiClient.get<AddressResponse[]>("/mypage/address", { member_id: memberId }),

  createAddress: (payload: AddressCreatePayload) =>
    apiClient.post<AddressResponse>("/mypage/address", payload),

  updateAddress: (addressId: string, payload: AddressUpdatePayload) =>
    apiClient.put<AddressResponse>(`/mypage/address/${addressId}`, payload),

  deleteAddress: (addressId: string, memberId: number) =>
    apiClient.delete<{ success: boolean }>(`/mypage/address/${addressId}`, { member_id: memberId }),
};

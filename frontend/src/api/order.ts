import apiClient from "./axios";

export type OrderItemIn = {
  product_id: number;
  quantity: number;
};

export type CreateOrderIn = {
  member_id: number;
  items: OrderItemIn[];
};

export const createOrder = (payload: CreateOrderIn) => {
  return apiClient.post<any>("orders/", payload);
};

export const getOrder = (orderId: number) => {
  return apiClient.get<any>(`orders/${orderId}`);
};

export const listOrders = (memberId?: number) => {
  return apiClient.get<any[]>("orders/", memberId ? { member_id: memberId } : undefined);
};

export default { createOrder, getOrder, listOrders };


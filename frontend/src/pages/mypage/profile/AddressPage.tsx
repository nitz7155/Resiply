import React, { useCallback, useEffect, useMemo, useState } from "react";
import useStore, { Address } from "@/lib/useStore";
import { useAuth } from "@/lib/AuthContext";
import { mypageApi, AddressResponse } from "@/api/mypage";
import { toast } from "@/hooks/use-toast";

type AddressFormState = {
  label: string;
  receiver: string;
  phone: string;
  addressLine: string;
  deliveryType: string;
  isDefault: boolean;
};

const createInitialFormState = (setDefault = false): AddressFormState => ({
  label: "",
  receiver: "",
  phone: "",
  addressLine: "",
  deliveryType: "",
  isDefault: setDefault,
});

const toStoreAddress = (payload: AddressResponse): Address => ({
  id: String(payload.id),
  label: payload.label,
  receiver: payload.receiver,
  phone: payload.phone ?? undefined,
  addressLine: payload.addressLine,
  deliveryType: payload.deliveryType ?? undefined,
  isDefault: !!payload.isDefault,
});

const AddressPage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const memberId = user?.id;

  const addresses = useStore((s) => s.addresses) ?? [];
  const setAddresses = useStore((s) => s.setAddresses);

  const [isFetching, setIsFetching] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<AddressFormState>(() => createInitialFormState(false));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [defaultPendingId, setDefaultPendingId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const isEditing = Boolean(editingAddressId);

  const loadAddresses = useCallback(async () => {
    if (!memberId) return;
    setIsFetching(true);
    try {
      const data = await mypageApi.getAddresses(memberId);
      setAddresses(data.map(toStoreAddress));
    } catch (error) {
      const message = error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
      toast({
        variant: "destructive",
        title: "배송지 정보를 불러오지 못했어요.",
        description: message,
      });
    } finally {
      setIsFetching(false);
    }
  }, [memberId, setAddresses]);

  useEffect(() => {
    if (memberId) {
      loadAddresses();
    } else if (!authLoading) {
      setAddresses([]);
    }
  }, [memberId, authLoading, loadAddresses, setAddresses]);

  const handleInputChange = (field: keyof Omit<AddressFormState, "isDefault">, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const handleCheckboxChange = (checked: boolean) => {
    setFormValues((prev) => ({ ...prev, isDefault: checked }));
  };

  const handleOpenForm = () => {
    setEditingAddressId(null);
    setFormValues(createInitialFormState(addresses.length === 0));
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormValues(createInitialFormState(false));
    setFormError(null);
    setEditingAddressId(null);
  };

  const handleEditClick = (address: Address) => {
    setIsFormOpen(true);
    setEditingAddressId(address.id);
    setFormError(null);
    setFormValues({
      label: address.label ?? "",
      receiver: address.receiver ?? "",
      phone: address.phone ?? "",
      addressLine: address.addressLine ?? "",
      deliveryType: address.deliveryType ?? "",
      isDefault: Boolean(address.isDefault),
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberId) {
      toast({ variant: "destructive", title: "로그인이 필요합니다." });
      return;
    }

    if (!formValues.label.trim() || !formValues.receiver.trim() || !formValues.addressLine.trim()) {
      setFormError("별칭, 받는 분, 주소는 필수 항목이에요.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const basePayload = {
        member_id: memberId,
        label: formValues.label.trim(),
        receiver: formValues.receiver.trim(),
        phone: formValues.phone.trim() || undefined,
        addressLine: formValues.addressLine.trim(),
        deliveryType: formValues.deliveryType.trim() || undefined,
        isDefault: formValues.isDefault,
      };

      if (editingAddressId) {
        await mypageApi.updateAddress(editingAddressId, basePayload);
        toast({ title: "배송지를 수정했어요." });
      } else {
        await mypageApi.createAddress(basePayload);
        toast({ title: "새 배송지를 추가했어요." });
      }

      handleCloseForm();
      await loadAddresses();
    } catch (error) {
      const message = error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
      const failTitle = editingAddressId ? "배송지 수정에 실패했어요." : "배송지 추가에 실패했어요.";
      toast({ variant: "destructive", title: failTitle, description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDefaultSelect = async (addressId: string) => {
    if (!memberId) return;
    const target = addresses.find((addr) => addr.id === addressId);
    if (!target || target.isDefault) return;

    setDefaultPendingId(addressId);
    try {
      await mypageApi.updateAddress(addressId, { member_id: memberId, isDefault: true });
      await loadAddresses();
      toast({ title: "기본 배송지를 변경했어요." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
      toast({ variant: "destructive", title: "기본 배송지 설정에 실패했어요.", description: message });
    } finally {
      setDefaultPendingId(null);
    }
  };

  const sortedAddresses = useMemo(
    () =>
      [...addresses].sort((a, b) => {
        if (a.isDefault === b.isDefault) return 0;
        return a.isDefault ? -1 : 1;
      }),
    [addresses],
  );
  const formSubmitLabel = isSubmitting ? "저장 중..." : isEditing ? "변경 내용 저장" : "배송지 저장";
  const addButtonLabel = isFormOpen ? (isEditing ? "수정 취소" : "입력창 닫기") : "새 배송지 추가";

  if (authLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
        로그인 정보를 확인하고 있어요...
      </div>
    );
  }

  if (!memberId) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        로그인 후 배송지를 관리할 수 있어요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">배송지 관리</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              배송지에 따라 상품정보 및 배송유형이 달라질 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 dark:border-slate-800" />

        <div className="mt-5 space-y-3">
          {isFormOpen && (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white">
                    {isEditing ? "배송지 수정" : "새 배송지 추가"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isEditing ? "선택한 배송지 정보를 수정하고 저장하세요." : "배송지 정보를 입력하고 저장해 주세요."}
                  </p>
                </div>
                {isEditing && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">수정 중</span>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">주소지 별칭 *</span>
                  <input
                    type="text"
                    value={formValues.label}
                    onChange={(e) => handleInputChange("label", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    placeholder="예: 우리집"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">받는 분 *</span>
                  <input
                    type="text"
                    value={formValues.receiver}
                    onChange={(e) => handleInputChange("receiver", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    placeholder="예: 홍길동"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">연락처</span>
                  <input
                    type="tel"
                    value={formValues.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    placeholder="010-0000-0000"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">배송 유형</span>
                  <input
                    type="text"
                    value={formValues.deliveryType}
                    onChange={(e) => handleInputChange("deliveryType", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    placeholder="예: 새벽배송"
                  />
                </label>
              </div>

              <label className="space-y-1" htmlFor="addressLine">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">주소 *</span>
                <textarea
                  id="addressLine"
                  value={formValues.addressLine}
                  onChange={(e) => handleInputChange("addressLine", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  placeholder="상세 주소까지 입력해 주세요."
                  rows={3}
                  required
                />
              </label>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary"
                    checked={formValues.isDefault}
                    onChange={(e) => handleCheckboxChange(e.target.checked)}
                  />
                  기본 배송지로 설정
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                    onClick={handleCloseForm}
                    disabled={isSubmitting}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={isSubmitting}
                  >
                    {formSubmitLabel}
                  </button>
                </div>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
            </form>
          )}

          {isFetching && sortedAddresses.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">배송지를 불러오는 중입니다...</div>
          ) : sortedAddresses.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">등록된 배송지가 없어요.</div>
          ) : (
            sortedAddresses.map((a) => {
              const isDefault = !!a.isDefault;
              const isPending = defaultPendingId === a.id;

              return (
                <div
                  key={a.id}
                  className="flex items-start gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5"
                >
                  <button
                    type="button"
                    aria-label={isDefault ? "기본배송지" : "기본배송지로 설정"}
                    onClick={() => handleDefaultSelect(a.id)}
                    disabled={isDefault || isPending}
                    className="mt-1 h-6 w-6 rounded-full flex items-center justify-center disabled:opacity-50"
                  >
                    <span
                      className={
                        isDefault
                          ? "h-4 w-4 rounded-full bg-primary"
                          : "h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-700"
                      }
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    {isDefault && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                        기본배송지
                      </span>
                    )}

                    <div className="mt-2 font-semibold text-slate-900 dark:text-white break-words">{a.addressLine}</div>

                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {a.receiver}
                      {a.phone ? `  ${a.phone}` : ""}
                    </div>

                    {a.deliveryType && (
                      <div className="mt-1">
                        <span className="text-sm font-semibold text-primary">{a.deliveryType}</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      onClick={() => handleEditClick(a)}
                    >
                      수정
                    </button>
                  </div>
                </div>
              );
            })
          )}

          <button
            type="button"
            className="mt-2 w-full h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold text-slate-900 dark:text-white"
            onClick={isFormOpen ? handleCloseForm : handleOpenForm}
          >
            {addButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddressPage;

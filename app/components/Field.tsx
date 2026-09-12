"use client";

/**
 * Labelled amount input with an optional max helper.
 *
 * Lives apart from the transaction machinery because it is pure presentation - every onchain
 * action now runs through TxModal, which owns signing, confirmation and explorer links.
 */
export function AmountField({
  label,
  value,
  onChange,
  suffix,
  max,
  onMax,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  max?: string;
  onMax?: () => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-600">{label}</span>
        {max !== undefined && (
          <button
            type="button"
            onClick={onMax}
            className="font-mono text-[10px] text-gray-600 transition hover:text-model"
          >
            max {max}
          </button>
        )}
      </span>
      <span className="mt-1 flex items-center rounded border border-[var(--color-line)] bg-ink-950 px-3 focus-within:border-gray-600">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          className="mono w-full bg-transparent py-2 text-[14px] text-gray-100 outline-none placeholder:text-gray-700"
        />
        {suffix && <span className="ml-2 font-mono text-[11px] text-gray-500">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block font-mono text-[10px] text-gray-600">{hint}</span>}
    </label>
  );
}

import { chooseMarket } from "@/app/actions/market";
import { currentMarket, storefront } from "@/lib/api";

/** Footer: "Country / region" — shown only when the store sells in more than one market. */
export async function MarketSelector() {
  const markets = await storefront.markets();
  if (markets.length < 2) return null;
  const current = await currentMarket();
  return (
    <form action={chooseMarket} className="flex flex-wrap items-center gap-2">
      <label htmlFor="market-select" className="text-xs">
        Country / region
      </label>
      <select
        id="market-select"
        name="market"
        defaultValue={current.id}
        className="sf-field sf-select h-9 py-0 text-sm"
      >
        {markets.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.currency})
          </option>
        ))}
      </select>
      <button type="submit" className="sf-button h-9 px-4 py-0 text-sm">
        Update
      </button>
    </form>
  );
}

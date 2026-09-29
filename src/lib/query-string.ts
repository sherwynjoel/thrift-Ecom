function clone(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  next.delete("page");
  return next;
}

export function toggleListParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = clone(params);
  const current = (next.get(key) ?? "").split(",").filter(Boolean);
  const list = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  if (list.length) next.set(key, list.join(","));
  else next.delete(key);
  return next;
}

export function setParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = clone(params);
  if (value === null || value === "") next.delete(key);
  else next.set(key, value);
  return next;
}

export function clearFilterParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  const sort = params.get("sort");
  if (sort) next.set("sort", sort);
  return next;
}

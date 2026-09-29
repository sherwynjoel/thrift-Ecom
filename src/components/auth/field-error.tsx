export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-danger" role="alert">{errors[0]}</p>;
}

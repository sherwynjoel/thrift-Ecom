import { googleAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function GoogleButton({ next }: { next: string }) {
  return (
    <form action={googleAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="secondary" className="w-full" data-testid="google-button">Continue with Google</Button>
    </form>
  );
}

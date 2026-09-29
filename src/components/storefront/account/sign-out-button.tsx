import { signOutAction } from "@/app/(storefront)/account/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" data-testid="sign-out">Sign out</Button>
    </form>
  );
}

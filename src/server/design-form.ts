import { ValidationError } from "@/server/errors";
import type { CreateDesignInput, DesignSideUpload } from "@/server/services/designs";
import type { DesignSide } from "@/lib/studio/constants";

export async function parseDesignForm(form: FormData): Promise<CreateDesignInput> {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const file = async (k: string) => {
    const v = form.get(k);
    return v instanceof File && v.size > 0 ? new Uint8Array(await v.arrayBuffer()) : null;
  };
  const json = (k: string): unknown => {
    const s = str(k);
    if (!s) return null;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      throw new ValidationError({ [k]: ["Design data is malformed"] });
    }
  };
  async function side(name: DesignSide): Promise<DesignSideUpload | null> {
    const j = json(`${name}Json`);
    const preview = await file(`${name}Preview`);
    const print = await file(`${name}Print`);
    if (j === null && !preview && !print) return null;
    if (j === null || !preview || !print) throw new ValidationError({ [name]: [`The ${name} design is incomplete. Please try again.`] });
    return { json: j, preview, print };
  }
  return {
    productId: str("productId"),
    variantId: str("variantId"),
    quantity: Number.parseInt(str("quantity") || "1", 10),
    rightsConfirmed: str("rightsConfirmed") === "true",
    front: await side("front"),
    back: await side("back"),
  };
}

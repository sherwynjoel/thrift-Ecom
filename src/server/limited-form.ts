import { LengthRequiredError, PayloadTooLargeError, ValidationError } from "@/server/errors";

/**
 * Reads a multipart body without ever buffering more than `maxBytes`: the declared Content-Length is
 * required and checked up front, and the stream itself is counted while it is read (a client can lie
 * about the length). Forms with more than `maxEntries` fields are refused.
 */
export async function readLimitedForm(req: Request, maxBytes: number, maxEntries: number, tooLarge?: string): Promise<FormData> {
  const header = req.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header.trim())) throw new LengthRequiredError();
  if (Number(header) > maxBytes) throw new PayloadTooLargeError(tooLarge);
  if (!req.body) throw new ValidationError({ body: ["Expected multipart form data"] });

  let seen = 0;
  let overflow = false;
  const counted = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          overflow = true;
          controller.error(new PayloadTooLargeError(tooLarge));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  let form: FormData;
  try {
    form = await new Request(req.url, { method: "POST", headers, body: counted, duplex: "half" } as RequestInit).formData();
  } catch {
    if (overflow) throw new PayloadTooLargeError(tooLarge);
    throw new ValidationError({ body: ["Expected multipart form data"] });
  }
  if ([...form.keys()].length > maxEntries) throw new ValidationError({ body: ["Too many form fields"] });
  return form;
}

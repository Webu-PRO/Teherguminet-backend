import { useCallback, useEffect, useMemo, useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Text, Textarea, toast } from "@medusajs/ui";

type ProductData = {
  id: string;
  title?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ProductResponse = {
  product?: ProductData;
  message?: string;
};

type WidgetProps = {
  data: ProductData;
};

const DESCRIPTION_HU_KEYS = [
  "description_hu",
  "description_hu_hu",
  "leiras_hu",
  "leiras_hu_hu",
] as const;
const DESCRIPTION_SK_KEYS = [
  "description_sk",
  "description_sk_sk",
  "leiras_sk",
  "leiras_sk_sk",
] as const;

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const readLocalizedDescription = (
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[]
) => {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = normalizeText(metadata[key]);
    if (value) {
      return value;
    }
  }

  return "";
};

const readErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    const message = payload?.message ?? payload?.error;
    if (typeof message === "string" && message.trim().length) {
      return message;
    }
  } catch {
    // ignore json parse errors
  }

  return fallback;
};

const ProductLocalizedDescriptionsWidget = ({ data }: WidgetProps) => {
  const productId = data.id;
  const [product, setProduct] = useState<ProductData | null>(null);
  const [descriptionHu, setDescriptionHu] = useState("");
  const [descriptionSk, setDescriptionSk] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fallbackDescription = useMemo(() => {
    const loadedDescription = normalizeText(product?.description);
    if (loadedDescription) {
      return loadedDescription;
    }
    return normalizeText(data.description) || "-";
  }, [data.description, product?.description]);

  const hydrateForm = useCallback((nextProduct: ProductData | null) => {
    const metadata = nextProduct?.metadata;
    const nextHu = readLocalizedDescription(metadata, DESCRIPTION_HU_KEYS);
    const nextSk = readLocalizedDescription(metadata, DESCRIPTION_SK_KEYS);

    setDescriptionHu(nextHu);
    setDescriptionSk(nextSk);
  }, []);

  const loadProduct = useCallback(async () => {
    if (!productId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        fields: "id,title,description,metadata",
      });

      const response = await fetch(
        `/admin/products/${encodeURIComponent(productId)}?${params.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült betölteni a termék leírásait."
        );
        throw new Error(message);
      }

      const payload = (await response.json()) as ProductResponse;
      const nextProduct = payload.product ?? null;
      setProduct(nextProduct);
      hydrateForm(nextProduct);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült betölteni a termék leírásait.";
      toast.error("Lokalizált leírások", {
        description: message,
      });
      setProduct(null);
      hydrateForm(null);
    } finally {
      setIsLoading(false);
    }
  }, [hydrateForm, productId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const handleSave = useCallback(async () => {
    if (!productId || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const baseMetadata =
        product?.metadata && typeof product.metadata === "object"
          ? { ...product.metadata }
          : data.metadata && typeof data.metadata === "object"
            ? { ...data.metadata }
            : {};

      for (const key of [...DESCRIPTION_HU_KEYS, ...DESCRIPTION_SK_KEYS]) {
        delete (baseMetadata as Record<string, unknown>)[key];
      }

      const nextHu = normalizeText(descriptionHu);
      const nextSk = normalizeText(descriptionSk);

      if (nextHu) {
        (baseMetadata as Record<string, unknown>).description_hu = nextHu;
      }

      if (nextSk) {
        (baseMetadata as Record<string, unknown>).description_sk = nextSk;
      }

      const response = await fetch(`/admin/products/${encodeURIComponent(productId)}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          metadata: baseMetadata,
        }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Nem sikerült menteni a lokalizált leírásokat."
        );
        throw new Error(message);
      }

      toast.success("Lokalizált leírások", {
        description: "A HU és SK leírások mentése sikeres.",
      });

      await loadProduct();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nem sikerült menteni a lokalizált leírásokat.";
      toast.error("Lokalizált leírások", {
        description: message,
      });
    } finally {
      setIsSaving(false);
    }
  }, [data.metadata, descriptionHu, descriptionSk, isSaving, loadProduct, product?.metadata, productId]);

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Heading level="h3">Lokalizált termékleírások (HU / SK)</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            A SK feed a <code>description_sk</code> mezőt használja, HU feed a{" "}
            <code>description_hu</code> mezőt.
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Ha nincs SK leírás, a feed a default leírásra esik vissza.
          </Text>
        </div>

        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="xsmall" weight="plus">
            Default leírás (fallback)
          </Text>
          <Text size="small" className="text-ui-fg-subtle mt-1 whitespace-pre-wrap">
            {fallbackDescription}
          </Text>
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="xsmall" weight="plus">
            Leírás (HU)
          </Text>
          <Textarea
            value={descriptionHu}
            onChange={(event) => {
              setDescriptionHu(event.target.value);
            }}
            placeholder="Magyar leírás..."
            rows={6}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="xsmall" weight="plus">
            Popis (SK)
          </Text>
          <Textarea
            value={descriptionSk}
            onChange={(event) => {
              setDescriptionSk(event.target.value);
            }}
            placeholder="Slovenský popis..."
            rows={6}
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="small"
            onClick={() => {
              void handleSave();
            }}
            isLoading={isSaving}
            disabled={isLoading || isSaving}
          >
            Mentés
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              void loadProduct();
            }}
            disabled={isLoading || isSaving}
          >
            Frissítés
          </Button>
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductLocalizedDescriptionsWidget;

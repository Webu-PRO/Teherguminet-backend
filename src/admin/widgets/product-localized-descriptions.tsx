import { useCallback, useEffect, useMemo, useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Button, Container, Input, Text, Textarea, toast } from "@medusajs/ui";

import { sdk } from "../lib/client";

type ProductData = {
  id: string;
  title?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ProductResponse = {
  product?: ProductData;
};

type HuToSkTranslationResponse = {
  title_sk?: string;
  description_sk?: string;
  translated_fields?: Array<"title_sk" | "description_sk">;
  skipped_fields?: Array<"title_sk" | "description_sk">;
  model?: string;
};

type WidgetProps = {
  data: ProductData;
};

const TITLE_HU_KEYS = ["title_hu"] as const;
const TITLE_SK_KEYS = ["title_sk"] as const;
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

const readErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    if (message.length) {
      return message;
    }
  }

  return fallback;
};

const ProductLocalizedDescriptionsWidget = ({ data }: WidgetProps) => {
  const productId = data.id;
  const [product, setProduct] = useState<ProductData | null>(null);
  const [titleHu, setTitleHu] = useState("");
  const [titleSk, setTitleSk] = useState("");
  const [descriptionHu, setDescriptionHu] = useState("");
  const [descriptionSk, setDescriptionSk] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const fallbackTitle = useMemo(() => {
    const loadedTitle = normalizeText(product?.title);
    if (loadedTitle) {
      return loadedTitle;
    }
    return normalizeText(data.title) || "-";
  }, [data.title, product?.title]);

  const fallbackDescription = useMemo(() => {
    const loadedDescription = normalizeText(product?.description);
    if (loadedDescription) {
      return loadedDescription;
    }
    return normalizeText(data.description) || "-";
  }, [data.description, product?.description]);

  const hydrateForm = useCallback((nextProduct: ProductData | null) => {
    const metadata = nextProduct?.metadata;
    const nextTitleHu = readLocalizedDescription(metadata, TITLE_HU_KEYS);
    const nextTitleSk = readLocalizedDescription(metadata, TITLE_SK_KEYS);
    const nextHu = readLocalizedDescription(metadata, DESCRIPTION_HU_KEYS);
    const nextSk = readLocalizedDescription(metadata, DESCRIPTION_SK_KEYS);

    setTitleHu(nextTitleHu);
    setTitleSk(nextTitleSk);
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
      const payload = (await sdk.admin.product.retrieve(productId, {
        fields: "id,title,description,metadata",
      })) as ProductResponse;
      const nextProduct = payload.product ?? null;
      setProduct(nextProduct);
      hydrateForm(nextProduct);
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült betölteni a termék lokalizált adatait."
      );
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

      for (const key of [...TITLE_HU_KEYS, ...TITLE_SK_KEYS]) {
        delete (baseMetadata as Record<string, unknown>)[key];
      }

      const nextTitleHu = normalizeText(titleHu);
      const nextTitleSk = normalizeText(titleSk);
      const nextHu = normalizeText(descriptionHu);
      const nextSk = normalizeText(descriptionSk);

      if (nextTitleHu) {
        (baseMetadata as Record<string, unknown>).title_hu = nextTitleHu;
      }

      if (nextTitleSk) {
        (baseMetadata as Record<string, unknown>).title_sk = nextTitleSk;
      }

      if (nextHu) {
        (baseMetadata as Record<string, unknown>).description_hu = nextHu;
      }

      if (nextSk) {
        (baseMetadata as Record<string, unknown>).description_sk = nextSk;
      }

      await sdk.admin.product.update(productId, {
        metadata: baseMetadata,
      });

      toast.success("Lokalizált leírások", {
        description: "A HU/SK címek és leírások mentése sikeres.",
      });

      await loadProduct();
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült menteni a lokalizált adatokat."
      );
      toast.error("Lokalizált leírások", {
        description: message,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    data.metadata,
    descriptionHu,
    descriptionSk,
    isSaving,
    loadProduct,
    product?.metadata,
    productId,
    titleHu,
    titleSk,
  ]);

  const handleAutoTranslate = useCallback(async () => {
    if (!productId || isLoading || isSaving || isTranslating) {
      return;
    }

    const sourceTitleHu =
      normalizeText(titleHu) ||
      (fallbackTitle === "-" ? "" : normalizeText(fallbackTitle));
    const sourceDescriptionHu =
      normalizeText(descriptionHu) ||
      (fallbackDescription === "-" ? "" : normalizeText(fallbackDescription));

    if (!sourceTitleHu && !sourceDescriptionHu) {
      toast.error("AI fordítás", {
        description: "Nincs HU forrásszöveg a fordításhoz.",
      });
      return;
    }

    setIsTranslating(true);
    try {
      const payload = (await sdk.client.fetch("/admin/ai-agent/translate", {
        method: "POST",
        body: {
          title_hu: sourceTitleHu,
          description_hu: sourceDescriptionHu,
          title_sk: normalizeText(titleSk),
          description_sk: normalizeText(descriptionSk),
          overwrite: false,
        },
      })) as HuToSkTranslationResponse;

      const nextTitleSk = normalizeText(payload?.title_sk);
      const nextDescriptionSk = normalizeText(payload?.description_sk);
      const translatedFields = Array.isArray(payload?.translated_fields)
        ? payload.translated_fields
        : [];

      if (nextTitleSk) {
        setTitleSk(nextTitleSk);
      }

      if (nextDescriptionSk) {
        setDescriptionSk(nextDescriptionSk);
      }

      if (!translatedFields.length) {
        toast.success("AI fordítás", {
          description: "Nincs üres SK mező, ezért nem történt új fordítás.",
        });
        return;
      }

      toast.success("AI fordítás", {
        description:
          "HU → SK fordítás elkészült. Ellenőrizd, majd kattints a Mentés gombra.",
      });
    } catch (error) {
      const message = readErrorMessage(
        error,
        "Nem sikerült AI fordítást kérni."
      );
      toast.error("AI fordítás", {
        description: message,
      });
    } finally {
      setIsTranslating(false);
    }
  }, [
    descriptionHu,
    descriptionSk,
    fallbackDescription,
    fallbackTitle,
    isLoading,
    isSaving,
    isTranslating,
    productId,
    titleHu,
    titleSk,
  ]);

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div>
          <Text size="small" leading="compact" weight="plus">
            Lokalizált termék adatok (HU / SK)
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1">
            A SK feed a <code>title_sk</code> és <code>description_sk</code> mezőket
            használja, HU feed a <code>title_hu</code> és{" "}
            <code>description_hu</code> mezőket.
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Ha az SK mezők üresek, a feed a HU értékekre esik vissza.
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Az AI fordítás csak az üres SK mezőket tölti ki. A módosítások mentéséhez
            kattints a Mentés gombra.
          </Text>
        </div>

        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="xsmall" leading="compact" weight="plus">
            Default cím (fallback)
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1 whitespace-pre-wrap">
            {fallbackTitle}
          </Text>
        </div>

        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="xsmall" leading="compact" weight="plus">
            Default leírás (fallback)
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle mt-1 whitespace-pre-wrap">
            {fallbackDescription}
          </Text>
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="xsmall" leading="compact" weight="plus">
            Cím (HU)
          </Text>
          <Input
            value={titleHu}
            onChange={(event) => {
              setTitleHu(event.target.value);
            }}
            placeholder="Magyar cím..."
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="xsmall" leading="compact" weight="plus">
            Názov (SK)
          </Text>
          <Input
            value={titleSk}
            onChange={(event) => {
              setTitleSk(event.target.value);
            }}
            placeholder="Slovenský názov..."
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="xsmall" leading="compact" weight="plus">
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
          <Text size="xsmall" leading="compact" weight="plus">
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
            variant="secondary"
            onClick={() => {
              void handleAutoTranslate();
            }}
            isLoading={isTranslating}
            disabled={isLoading || isSaving || isTranslating}
          >
            AI fordítás HU→SK
          </Button>
          <Button
            size="small"
            onClick={() => {
              void handleSave();
            }}
            isLoading={isSaving}
            disabled={isLoading || isSaving || isTranslating}
          >
            Mentés
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              void loadProduct();
            }}
            disabled={isLoading || isSaving || isTranslating}
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

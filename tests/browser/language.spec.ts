import { expect, test } from "@playwright/test";

test("language selection translates the arena and persists after reload", async ({ page }) => {
  await page.goto("/");
  const language = page.getByRole("combobox", { name: "Language / Dil" });
  await expect(language).toHaveValue("en");
  await expect(page.getByRole("button", { name: "ENTER THE ARENA" })).toBeVisible();
  await language.selectOption("tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await page.getByRole("button", { name: "ARENAYA GİR" }).click();
  await expect(page.getByText("Her turda yeni, rastgele bir hedef.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(language).toHaveValue("tr");
  await expect(page.getByRole("button", { name: "ARENAYA GİR" })).toBeVisible();
  await language.selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "ENTER THE ARENA" })).toBeVisible();
});

test("switching language preserves game state and nickname", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Zero Point", exact: true }).click();
  const nickname = page.locator("#zero-call-sign");
  await nickname.fill("Test Oyuncu");
  const language = page.getByRole("combobox", { name: "Language / Dil" });
  await language.selectOption("tr");
  await expect(nickname).toHaveValue("Test Oyuncu");
  await page.getByRole("button", { name: "OYUNA BAŞLA", exact: true }).click();
  await expect(page.getByText("HEDEF SÜRE", { exact: true })).toBeVisible();
  await language.selectOption("en");
  await expect(page.getByText("TARGET TIME", { exact: true })).toBeVisible();
  await expect(page.locator(".zero-play-panel")).toBeVisible();
  await expect(page.locator(".zero-intro")).toHaveCount(0);
});

test("Turkish Cyber Lab scenarios work on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language / Dil" }).selectOption("tr");
  await page.getByRole("button", { name: "SİBER LABORATUVARA GİR", exact: false }).click();
  await page.getByRole("button", { name: "DENEYE BAŞLA" }).first().click();
  await expect(page.getByText("Bir yabancı bu kurgusal öğrenciye", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Herkese açık karşılama masası vardiyası", exact: false }).click();
  await expect(page.getByText("İYİ YAKALADIN.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "SONRAKİ SENARYO" }).click();
  await expect(page.getByText("Zararsız görünen hangi paylaşım", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("translated investigation options keep their API values", async ({ page }) => {
  await page.goto("/digital-detective");
  await page.getByRole("combobox", { name: "Language / Dil" }).selectOption("tr");
  await expect(page.getByRole("heading", { name: "DİJİTAL DEDEKTİF." })).toBeVisible();
  const difficulty = page.getByRole("combobox", { name: "Zorluk", exact: true });
  await difficulty.selectOption("advanced");
  await expect(difficulty).toHaveValue("advanced");
  await expect(difficulty.locator("option:checked")).toHaveText("ileri");
  await page.getByRole("button", { name: "NASIL OYNANIR · ÜCRETSİZ REHBER" }).click();
  await expect(page.getByRole("heading", { name: "Dedektifin saha rehberi" })).toBeVisible();
});

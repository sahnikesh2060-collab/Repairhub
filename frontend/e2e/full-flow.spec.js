import { expect, test } from '@playwright/test';

// Seed accounts (backend/src/seed/seed.js); the stack is in-memory and reseeded per run.
const PASSWORD = 'Password@123';
const CUSTOMER = 'sita@repairhub.test'; // New Baneshwor
const TECHNICIAN = 'bikash@repairhub.test'; // Koteshwor, AC, verified, online
const NEW_BANESHWOR = { latitude: 27.6915, longitude: 85.342 };
const KOTESHWOR = { latitude: 27.6789, longitude: 85.3494 };

function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('a customer and a technician complete a repair end to end', async ({ browser }) => {
  const customerContext = await browser.newContext({
    geolocation: NEW_BANESHWOR,
    permissions: ['geolocation'],
  });
  const techContext = await browser.newContext({
    geolocation: KOTESHWOR,
    permissions: ['geolocation'],
  });
  const customer = await customerContext.newPage();
  const tech = await techContext.newPage();
  const title = `AC not cooling ${Date.now()}`;

  await test.step('both sign in; the technician is online', async () => {
    await signIn(tech, TECHNICIAN);
    await expect(tech).toHaveURL(/\/technician$/);
    await expect(tech.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await signIn(customer, CUSTOMER);
    await expect(customer).toHaveURL(/\/customer$/);
  });

  await test.step('customer creates an AC request at New Baneshwor', async () => {
    await customer.goto('/customer/bookings/new?category=AC');
    await customer.getByLabel('Title').fill(title);
    await customer
      .getByLabel('Describe the problem')
      .fill('The bedroom AC blows warm air and the outdoor unit rattles.');
    await customer.getByRole('button', { name: 'Continue' }).click();
    await expect(customer.getByText(/Selected: lat 27\.6915, lng 85\.342/)).toBeVisible();
    await customer.getByRole('button', { name: 'Continue' }).click();
    await customer.getByRole('button', { name: 'Send request' }).click();
    await expect(customer).toHaveURL(/\/customer\/bookings\/[a-f0-9]{24}$/);
    await expect(customer.getByText(/Notified \d+ technicians? nearby/)).toBeVisible();
  });

  await test.step('technician sees it live and accepts with a time', async () => {
    const card = tech.getByRole('article', { name: title });
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card.getByText('New', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'View & Accept' }).click();
    const dialog = tech.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Tomorrow 10-11 AM' }).click();
    await dialog.getByLabel('Estimated fee (NPR)').fill('800');
    await dialog.getByRole('button', { name: 'Accept & send time' }).click();
    await expect(tech).toHaveURL(/\/technician\/jobs\/[a-f0-9]{24}$/);
  });

  await test.step('customer asks for another time', async () => {
    await expect(customer.getByText('Proposal 1 of 3')).toBeVisible();
    await customer.getByRole('button', { name: 'Request New Time', exact: true }).click();
    const dialog = customer.getByRole('dialog');
    await dialog.getByLabel(/Note for the technician/).fill('After 5 PM please');
    await dialog.getByRole('button', { name: 'Request new time', exact: true }).click();
    await expect(customer.getByText(/Waiting for .+ to propose a new time/)).toBeVisible();
  });

  await test.step('technician sees the note and proposes 5:30 PM', async () => {
    await expect(tech.getByText('“After 5 PM please”', { exact: true })).toBeVisible();
    await expect(tech.getByText('Sita asked for another time', { exact: false })).toBeVisible();
    await tech.getByRole('button', { name: 'Propose New Time' }).click();
    const dialog = tech.getByRole('dialog');
    await dialog.getByLabel('Date').fill(tomorrowDate());
    await dialog.getByLabel('Arrival time').fill('17:30');
    await dialog.getByRole('button', { name: 'Send new time' }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step('customer accepts; both reach step 3', async () => {
    await expect(customer.getByText('Proposal 2 of 3')).toBeVisible();
    await customer.getByRole('button', { name: 'Accept Time' }).click();
    await expect(customer.getByText('Confirmed arrival')).toBeVisible();
    await expect(tech.getByText('Confirmed arrival')).toBeVisible();
    await expect(tech.getByRole('link', { name: /Open in Google Maps/ })).toBeVisible();
  });

  await test.step('technician is on the way; the customer sees the map and ETA', async () => {
    await tech.getByRole('button', { name: 'Mark On The Way' }).click();
    await expect(tech.getByText('Sharing your live location')).toBeVisible();
    await expect(customer.getByText(/About \d+ min away \(estimate\)/)).toBeVisible();
    await expect(customer.getByRole('region', { name: 'Live technician location' })).toBeVisible();
    await techContext.setGeolocation({ latitude: 27.687, longitude: 85.345 });
  });

  await test.step('repair starts and completes with NPR 1,200', async () => {
    await tech.getByRole('button', { name: 'Start Repair' }).click();
    await expect(customer.locator('main header').getByText('In progress')).toBeVisible();
    await tech.getByRole('button', { name: 'Complete Job' }).click();
    const dialog = tech.getByRole('dialog');
    await dialog.getByLabel('Final cost (NPR)').fill('1200');
    await dialog.getByRole('button', { name: 'Complete job', exact: true }).click();
    await expect(customer.getByText('NPR 1,200')).toBeVisible();
  });

  await test.step('customer leaves a 5-star review', async () => {
    // The radio input is visually hidden (stars are drawn instead); select it by its label.
    await customer.getByRole('radio', { name: '5 stars (Excellent)' }).check({ force: true });
    await customer.getByRole('button', { name: 'Submit review' }).click();
    await expect(customer.getByText('Your review')).toBeVisible();
  });

  await test.step("the technician's earnings include the job", async () => {
    await tech.goto('/technician/earnings');
    await expect(tech.getByRole('link', { name: title })).toBeVisible();
  });

  await customerContext.close();
  await techContext.close();
});

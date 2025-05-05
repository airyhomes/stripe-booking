require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const Stripe = require('stripe');
const ical = require('node-ical');
const { DateTime } = require('luxon');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Stripe with secret key from environment variable
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Serve static files from 'public' directory (index.html, success.html, cancel.html)
app.use(express.static(path.join(__dirname, 'public')));

// iCal URL from Google Calendar only
const calendarURLs = [
  'https://calendar.google.com/calendar/ical/0870251707b2d16ef9fef974b3c330afb97e4720e492ff333f49a02e95f21748%40group.calendar.google.com/public/basic.ics'
];

// Helper to check availability
async function checkAvailability(startDate, endDate) {
  const start = DateTime.fromISO(startDate, { zone: 'Europe/Athens' });
  const end = DateTime.fromISO(endDate, { zone: 'Europe/Athens' });

  if (!start.isValid || !end.isValid || end <= start) {
    return false;
  }

  const datesToCheck = new Set();
  for (let d = start; d < end; d = d.plus({ days: 1 })) {
    datesToCheck.add(d.toISODate());
  }

  for (const url of calendarURLs) {
    try {
      const data = await ical.async.fromURL(url);
      for (const event of Object.values(data)) {
        if (event.start && event.end) {
          let eventStart = DateTime.fromJSDate(event.start, { zone: 'Europe/Athens' });
          let eventEnd = DateTime.fromJSDate(event.end, { zone: 'Europe/Athens' });

          // FIX: Adjust all-day event ending to exclude last day (only for all-day events)
          if (
            event.datetype === 'date' ||
            (eventStart.hour === 0 && eventStart.minute === 0 &&
             eventEnd.hour === 0 && eventEnd.minute === 0 && eventEnd > eventStart)
          ) {
            eventEnd = eventEnd.minus({ days: 1 });
          }

          for (let d = eventStart; d <= eventEnd; d = d.plus({ days: 1 })) {
            const iso = d.toISODate();
            if (datesToCheck.has(iso)) {
              return false;
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
      return false;
    }
  }
  return true;
}

// Root route serves the booking form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to check date availability
app.get('/check-dates', async (req, res) => {
  const { checkin, checkout } = req.query;
  const available = await checkAvailability(checkin, checkout);
  res.json({ available });
});

// Endpoint to create Stripe Checkout session
app.get('/pay', async (req, res) => {
  try {
    const { name, email, nights, breakfast, checkin, checkout } = req.query;

    const available = await checkAvailability(checkin, checkout);
    if (!available) {
      return res.status(400).send('Selected dates are not available.');
    }

    const nightsNum = parseInt(nights, 10) || 0;
    const breakfastIncluded = breakfast === 'Yes';

    const baseRate = 70;
    const breakfastRate = 15;
    const totalCost = nightsNum * baseRate + (breakfastIncluded ? nightsNum * breakfastRate : 0);
    const amountInCents = Math.round(totalCost * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Booking: ${nightsNum} night(s) - ${breakfastIncluded ? 'with breakfast' : 'no breakfast'}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/success.html`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel.html`,
    });

    res.redirect(303, session.url);
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

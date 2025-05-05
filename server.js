require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const Stripe = require('stripe');
const ical = require('node-ical');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Μόνο το Google Calendar του "stone house"
const calendarURLs = [
  'https://calendar.google.com/calendar/ical/0870251707b2d16ef9fef974b3c330afb97e4720e492ff333f49a02e95f21748%40group.calendar.google.com/public/basic.ics'
];

// Έλεγχος διαθεσιμότητας
async function checkAvailability(startDate, endDate) {
  for (const url of calendarURLs) {
    const data = await ical.async.fromURL(url);
    for (const event of Object.values(data)) {
      if (event.start && event.end) {
        if (new Date(event.start) < new Date(endDate) && new Date(event.end) > new Date(startDate)) {
          return false;
        }
      }
    }
  }
  return true;
}

// Route για φόρμα
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Έλεγχος ημερομηνιών
app.get('/check-dates', async (req, res) => {
  const { checkin, checkout } = req.query;
  const available = await checkAvailability(checkin, checkout);
  res.json({ available });
});

// Stripe Checkout
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
    console.error('Stripe Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Εκκίνηση server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

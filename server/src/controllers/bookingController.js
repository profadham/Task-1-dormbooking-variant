import Joi from 'joi';
import { Booking } from '../models/Booking.js';

const createSchema = Joi.object({
  roomNumber: Joi.string().required(),
  startDate: Joi.date().required().less(Joi.ref('endDate')),
  endDate: Joi.date().required(),
  purpose: Joi.string().optional(),
  bookedBy: Joi.string().hex().length(24).optional()
});

const updateSchema = Joi.object({
  roomNumber: Joi.string(),
  startDate: Joi.date(),
  endDate: Joi.date(),
  purpose: Joi.string(),
  bookedBy: Joi.string().hex().length(24)
}).min(1);

function publicBooking(b) {
  if (!b) return null;

  let bookedBy = b.bookedBy;

  if (bookedBy && typeof bookedBy === 'object' && bookedBy._id) {
    bookedBy = {
      id: bookedBy._id.toString(),
      name: bookedBy.name,
      email: bookedBy.email
    };
  } else if (bookedBy) {
    bookedBy = bookedBy.toString();
  }

  return {
    id: b._id.toString(),
    roomNumber: b.roomNumber,
    startDate: b.startDate,
    endDate: b.endDate,
    purpose: b.purpose,
    bookedBy
  };
}

async function conflictExists(b) {
  const query = {
    roomNumber: b.roomNumber,
    startDate: { $lt: b.endDate },
    endDate: { $gt: b.startDate }
  };

  if (b._id) {
    query._id = { $ne: b._id };
  }

  const conflictingBooking = await Booking.findOne(query);
  return !!conflictingBooking;
}

// TODO: per README.md section 4, you will need a way to detect whether a
// proposed booking conflicts with an existing one on the same room.

// GET /api/bookings
// TODO: implement per README.md section 3.
export async function getAllBookings(req, res, next) {
    try {
      const bookings = await Booking.find().populate('bookedBy').sort({ createdAt: -1 }).lean();
      res.json({ bookings : bookings.map(publicBooking) });
    } catch (err) { next(err); }
}

// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id).populate('bookedBy');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ booking: publicBooking(booking) });
  } catch (err) { next(err); }
}

// POST /api/bookings
// TODO: implement per README.md sections 3 and 4.
export async function createBooking(req, res, next) {
    try {
      const { value, error } = createSchema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const hasConflict = await conflictExists(value);
      if (hasConflict) {
        return res.status(409).json({ message: 'Booking conflicts with an existing one' });
      }

      const booking = await Booking.create(value);
      const populated = await Booking.findById(booking._id).populate('bookedBy');
      res.status(201).json({ booking: publicBooking(populated) });
    } catch (err) { next(err); }
}

// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Booking not found' });

    const roomNumber = value.roomNumber ?? existing.roomNumber;
    const startDate = value.startDate ?? existing.startDate;
    const endDate = value.endDate ?? existing.endDate;

    if (startDate >= endDate) {
      return res.status(400).json({ message: 'startDate must be before endDate' });
    }

    const hasConflict = await conflictExists({ _id: req.params.id, roomNumber, startDate, endDate });
    if (hasConflict) {
      return res.status(409).json({ message: 'Booking conflicts with an existing one' });
    }

    const updated = await Booking.findByIdAndUpdate(
      req.params.id,
      { $set: { ...value, roomNumber, startDate, endDate } },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Booking not found' });

    const populated = await Booking.findById(updated._id).populate('bookedBy');
    res.json({ booking: publicBooking(populated) });
  } catch (err) { next(err); }
}

// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

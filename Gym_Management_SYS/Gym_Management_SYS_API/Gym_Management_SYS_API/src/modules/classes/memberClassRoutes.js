import express from 'express';
import { protect, authorize } from '../../middleware/authMiddleware.js';
import { validatePagination, validateUUIDParam } from '../../middleware/validators.js';
import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';
import { writeAuditLog } from '../../utils/auditLog.js';

const router = express.Router();
router.use(protect);

router.get('/', authorize('admin', 'manager', 'member'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, classType, difficultyLevel } = req.query;
  const filters = ['c.is_active = TRUE', 'c.deleted_at IS NULL'];
  const values = [];
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(c.name ILIKE $${values.length} OR c.description ILIKE $${values.length})`);
  }
  if (classType) {
    values.push(classType);
    filters.push(`c.class_type = $${values.length}`);
  }
  if (difficultyLevel) {
    values.push(difficultyLevel);
    filters.push(`c.difficulty_level = $${values.length}`);
  }

  const count = await query(
    `SELECT COUNT(*) FROM classes c WHERE ${filters.join(' AND ')}`,
    values
  );
  const offset = (Number(page) - 1) * Number(limit);
  const result = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM class_schedules cs
        WHERE cs.class_id = c.id AND cs.status = 'scheduled'
          AND (cs.scheduled_date + cs.start_time) > NOW()) AS upcoming_sessions
     FROM classes c
     WHERE ${filters.join(' AND ')}
     ORDER BY c.name
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, Number(limit), offset]
  );

  res.json({
    success: true,
    data: {
      classes: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(Number(count.rows[0].count) / Number(limit)),
        totalRecords: Number(count.rows[0].count),
        limit: Number(limit),
      },
    },
  });
}));

router.get('/schedules', authorize('admin', 'manager', 'member'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, date, startDate, endDate, classId, trainerId } = req.query;
  const filters = [
    'c.is_active = TRUE',
    'c.deleted_at IS NULL',
    `cs.status = 'scheduled'`,
    `(cs.scheduled_date + cs.start_time) > NOW()`,
  ];
  const values = [];
  if (date) {
    values.push(date);
    filters.push(`cs.scheduled_date = $${values.length}`);
  }
  if (startDate) {
    values.push(startDate);
    filters.push(`cs.scheduled_date >= $${values.length}`);
  }
  if (endDate) {
    values.push(endDate);
    filters.push(`cs.scheduled_date <= $${values.length}`);
  }
  if (classId) {
    values.push(classId);
    filters.push(`cs.class_id = $${values.length}`);
  }
  if (trainerId) {
    values.push(trainerId);
    filters.push(`cs.trainer_id = $${values.length}`);
  }

  const count = await query(
    `SELECT COUNT(*)
     FROM class_schedules cs JOIN classes c ON c.id = cs.class_id
     WHERE ${filters.join(' AND ')}`,
    values
  );
  const offset = (Number(page) - 1) * Number(limit);
  const result = await query(
    `SELECT cs.id AS schedule_id, cs.class_id, cs.trainer_id,
            cs.scheduled_date, cs.start_time, cs.end_time, cs.status AS schedule_status,
            c.name AS class_name, c.description, c.class_type, c.difficulty_level,
            c.duration_minutes, c.capacity, c.room, c.required_plan_level,
            c.requires_booking, c.booking_deadline_hours,
            trainer.full_name AS trainer_name,
            COALESCE(bookings.confirmed_count, 0) AS booked_count,
            GREATEST(c.capacity - COALESCE(bookings.confirmed_count, 0), 0) AS spots_remaining,
            CASE WHEN bookings.member_booking_id IS NULL THEN NULL
                 ELSE bookings.member_booking_status END AS my_booking_status
     FROM class_schedules cs
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users trainer ON trainer.id = cs.trainer_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE cb.booking_status = 'confirmed') AS confirmed_count,
              MAX(cb.id::text) FILTER (WHERE cb.user_id = $${values.length + 1}) AS member_booking_id,
              MAX(cb.booking_status) FILTER (WHERE cb.user_id = $${values.length + 1}) AS member_booking_status
       FROM class_bookings cb
       WHERE cb.schedule_id = cs.id
     ) bookings ON TRUE
     WHERE ${filters.join(' AND ')}
     ORDER BY cs.scheduled_date, cs.start_time
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [...values, req.user.id, Number(limit), offset]
  );

  res.json({
    success: true,
    data: {
      schedules: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(Number(count.rows[0].count) / Number(limit)),
        totalRecords: Number(count.rows[0].count),
        limit: Number(limit),
      },
    },
  });
}));

router.get('/my-bookings', authorize('member'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, upcoming } = req.query;
  const filters = ['cb.user_id = $1'];
  const values = [req.user.id];
  if (status) {
    if (!['confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show'].includes(status)) {
      throw new AppError('Invalid booking status', 400);
    }
    values.push(status);
    filters.push(`cb.booking_status = $${values.length}`);
  }
  if (upcoming === 'true') {
    filters.push(`(cs.scheduled_date + cs.start_time) > NOW()`);
  } else if (upcoming === 'false') {
    filters.push(`(cs.scheduled_date + cs.start_time) <= NOW()`);
  }

  const count = await query(
    `SELECT COUNT(*) FROM class_bookings cb
     JOIN class_schedules cs ON cs.id = cb.schedule_id
     WHERE ${filters.join(' AND ')}`,
    values
  );
  const offset = (Number(page) - 1) * Number(limit);
  const result = await query(
    `SELECT cb.id AS booking_id, cb.booking_status, cb.waitlist_position,
            cb.attended_at, cb.cancelled_at, cb.cancellation_reason,
            cb.created_at AS booked_at,
            cs.id AS schedule_id, cs.scheduled_date, cs.start_time, cs.end_time,
            cs.status AS schedule_status,
            c.id AS class_id, c.name AS class_name, c.class_type, c.duration_minutes,
            c.room, c.image_url,
            trainer.id AS trainer_id, trainer.full_name AS trainer_name
     FROM class_bookings cb
     JOIN class_schedules cs ON cs.id = cb.schedule_id
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users trainer ON trainer.id = cs.trainer_id
     WHERE ${filters.join(' AND ')}
     ORDER BY cs.scheduled_date DESC, cs.start_time DESC, cb.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, Number(limit), offset]
  );

  res.json({
    success: true,
    data: {
      bookings: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(Number(count.rows[0].count) / Number(limit)),
        totalRecords: Number(count.rows[0].count),
        limit: Number(limit),
      },
    },
  });
}));

router.get('/bookings/:bookingId', validateUUIDParam('bookingId'), authorize('member'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT cb.id AS booking_id, cb.booking_status, cb.waitlist_position,
            cb.attended_at, cb.cancelled_at, cb.cancellation_reason, cb.created_at AS booked_at,
            cs.id AS schedule_id, cs.scheduled_date, cs.start_time, cs.end_time,
            cs.status AS schedule_status, c.id AS class_id, c.name AS class_name,
            c.class_type, c.duration_minutes, c.room, trainer.full_name AS trainer_name
     FROM class_bookings cb
     JOIN class_schedules cs ON cs.id = cb.schedule_id
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users trainer ON trainer.id = cs.trainer_id
     WHERE cb.id = $1 AND cb.user_id = $2`,
    [req.params.bookingId, req.user.id]
  );
  if (!result.rows.length) throw new AppError('Booking not found', 404);
  res.json({ success: true, data: { booking: result.rows[0] } });
}));

router.get('/:classId/schedules', validateUUIDParam('classId'), authorize('admin', 'manager', 'member'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, startDate, endDate } = req.query;
  const filters = ['cs.class_id = $1', `cs.status = 'scheduled'`, `c.is_active = TRUE`, `c.deleted_at IS NULL`];
  const values = [req.params.classId];
  if (startDate) {
    values.push(startDate);
    filters.push(`cs.scheduled_date >= $${values.length}`);
  }
  if (endDate) {
    values.push(endDate);
    filters.push(`cs.scheduled_date <= $${values.length}`);
  }
  const offset = (Number(page) - 1) * Number(limit);
  values.push(Number(limit), offset);
  const result = await query(
    `SELECT cs.*, c.name AS class_name, c.capacity,
            trainer.full_name AS trainer_name,
            (SELECT COUNT(*) FROM class_bookings cb
             WHERE cb.schedule_id = cs.id AND cb.booking_status = 'confirmed') AS booked_count
     FROM class_schedules cs
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users trainer ON trainer.id = cs.trainer_id
     WHERE ${filters.join(' AND ')}
       AND (cs.scheduled_date + cs.start_time) > NOW()
     ORDER BY cs.scheduled_date, cs.start_time
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ success: true, data: { schedules: result.rows, pagination: { currentPage: Number(page), limit: Number(limit) } } });
}));

router.post('/schedules/:scheduleId/book', validateUUIDParam('scheduleId'), authorize('member'), asyncHandler(async (req, res) => {
  const booking = await transaction(async (client) => {
    const scheduleResult = await client.query(
      `SELECT cs.id, cs.class_id, cs.trainer_id, cs.scheduled_date, cs.start_time,
              cs.status, c.capacity, c.is_active, c.deleted_at AS class_deleted_at,
              c.requires_booking, c.booking_deadline_hours, c.required_plan_level
       FROM class_schedules cs
       JOIN classes c ON c.id = cs.class_id
       WHERE cs.id = $1
       FOR UPDATE OF cs`,
      [req.params.scheduleId]
    );
    if (!scheduleResult.rows.length) throw new AppError('Class schedule not found', 404);
    const schedule = scheduleResult.rows[0];
    if (!schedule.is_active || schedule.class_deleted_at) throw new AppError('Class is not available', 400);
    if (schedule.status !== 'scheduled') throw new AppError('This class is not open for booking', 400);
    if (!schedule.requires_booking) throw new AppError('This class does not accept bookings', 400);

    const cutoff = await client.query(
      `SELECT ($1::date + $2::time) > NOW() + make_interval(hours => $3) AS is_before_deadline`,
      [schedule.scheduled_date, schedule.start_time, schedule.booking_deadline_hours]
    );
    if (!cutoff.rows[0].is_before_deadline) {
      throw new AppError('The booking deadline for this class has passed', 400);
    }

    const subscriptionResult = await client.query(
      `SELECT mp.access_level
       FROM subscriptions s
       JOIN membership_plans mp ON mp.id = s.plan_id
       WHERE s.user_id = $1 AND s.status = 'active'
         AND s.start_date <= CURRENT_DATE AND s.end_date >= CURRENT_DATE
         AND s.deleted_at IS NULL
       ORDER BY s.end_date DESC
       LIMIT 1`,
      [req.user.id]
    );
    if (!subscriptionResult.rows.length) {
      throw new AppError('An active subscription is required to book a class', 403);
    }
    if (schedule.required_plan_level) {
      const levels = { basic: 1, premium: 2, vip: 3 };
      if (levels[subscriptionResult.rows[0].access_level] < levels[schedule.required_plan_level]) {
        throw new AppError('Your membership plan does not include this class', 403);
      }
    }

    const existing = await client.query(
      `SELECT id, booking_status FROM class_bookings
       WHERE schedule_id = $1 AND user_id = $2`,
      [schedule.id, req.user.id]
    );
    if (existing.rows.length && existing.rows[0].booking_status !== 'cancelled') {
      throw new AppError('You already have a booking for this class', 409);
    }

    const confirmed = await client.query(
      `SELECT COUNT(*) FROM class_bookings
       WHERE schedule_id = $1 AND booking_status = 'confirmed'`,
      [schedule.id]
    );
    const isFull = Number(confirmed.rows[0].count) >= schedule.capacity;
    const waitlist = isFull
      ? await client.query(
        `SELECT COUNT(*) FROM class_bookings
         WHERE schedule_id = $1 AND booking_status = 'waitlisted'`,
        [schedule.id]
      )
      : null;
    const bookingStatus = isFull ? 'waitlisted' : 'confirmed';
    const waitlistPosition = isFull ? Number(waitlist.rows[0].count) + 1 : null;

    const result = existing.rows.length
      ? await client.query(
        `UPDATE class_bookings
         SET booking_status = $1, waitlist_position = $2, cancelled_at = NULL,
             cancellation_reason = NULL, attended_at = NULL, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [bookingStatus, waitlistPosition, existing.rows[0].id]
      )
      : await client.query(
        `INSERT INTO class_bookings(schedule_id, user_id, booking_status, waitlist_position)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [schedule.id, req.user.id, bookingStatus, waitlistPosition]
      );
    return result.rows[0];
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'class_booking.created',
    entityType: 'class_booking',
    entityId: booking.id,
    metadata: { scheduleId: req.params.scheduleId, bookingStatus: booking.booking_status },
  });
  res.status(201).json({ success: true, message: 'Class booked successfully', data: { booking } });
}));

router.delete('/bookings/:bookingId', validateUUIDParam('bookingId'), authorize('member'), asyncHandler(async (req, res) => {
  const booking = await transaction(async (client) => {
    const result = await client.query(
      `SELECT cb.*, cs.scheduled_date, cs.start_time
       FROM class_bookings cb
       JOIN class_schedules cs ON cs.id = cb.schedule_id
       WHERE cb.id = $1 AND cb.user_id = $2
       FOR UPDATE OF cb, cs`,
      [req.params.bookingId, req.user.id]
    );
    if (!result.rows.length) throw new AppError('Booking not found', 404);
    const current = result.rows[0];
    if (!['confirmed', 'waitlisted'].includes(current.booking_status)) {
      throw new AppError('Only confirmed or waitlisted bookings can be cancelled', 400);
    }
    const future = await client.query(
      `SELECT ($1::date + $2::time) > NOW() AS is_future`,
      [current.scheduled_date, current.start_time]
    );
    if (!future.rows[0].is_future) throw new AppError('A class that has already started cannot be cancelled', 400);

    const updated = await client.query(
      `UPDATE class_bookings
       SET booking_status = 'cancelled', cancelled_at = NOW(),
           cancellation_reason = 'Cancelled by member', waitlist_position = NULL,
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.bookingId]
    );

    if (current.booking_status === 'confirmed') {
      const next = await client.query(
        `SELECT id FROM class_bookings
         WHERE schedule_id = $1 AND booking_status = 'waitlisted'
         ORDER BY waitlist_position, created_at
         LIMIT 1 FOR UPDATE`,
        [current.schedule_id]
      );
      if (next.rows.length) {
        await client.query(
          `UPDATE class_bookings SET booking_status = 'confirmed',
             waitlist_position = NULL, updated_at = NOW()
           WHERE id = $1`,
          [next.rows[0].id]
        );
      }
    }

    await client.query(
      `WITH ordered_waitlist AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position, created_at) AS position
         FROM class_bookings
         WHERE schedule_id = $1 AND booking_status = 'waitlisted'
       )
       UPDATE class_bookings cb
       SET waitlist_position = ordered_waitlist.position, updated_at = NOW()
       FROM ordered_waitlist
       WHERE cb.id = ordered_waitlist.id`,
      [current.schedule_id]
    );
    return updated.rows[0];
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'class_booking.cancelled',
    entityType: 'class_booking',
    entityId: booking.id,
  });
  res.json({ success: true, message: 'Booking cancelled successfully', data: { booking } });
}));

export default router;

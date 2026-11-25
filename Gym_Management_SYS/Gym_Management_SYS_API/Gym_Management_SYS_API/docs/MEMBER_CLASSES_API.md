# Member classes and trainer API

All routes require `Authorization: Bearer <accessToken>`.

## Browse classes and schedules

- `GET /api/classes?page=1&limit=20&search=&classType=&difficultyLevel=`
- `GET /api/classes/schedules?page=1&limit=20&date=&startDate=&endDate=&classId=&trainerId=`
- `GET /api/classes/:classId/schedules?page=1&limit=20&startDate=&endDate=`

Schedule results include the class, trainer, capacity, number of confirmed bookings,
remaining spots, and the current member's booking status.

## Book and manage own bookings

- `POST /api/classes/schedules/:scheduleId/book`
- `GET /api/classes/my-bookings?page=1&limit=20&status=&upcoming=true`
- `GET /api/classes/bookings/:bookingId`
- `DELETE /api/classes/bookings/:bookingId`

Booking body is optional:

```json
{}
```

Members must have an active subscription that includes the class's required plan
level. Booking closes at the class's configured `bookingDeadlineHours`. When class
capacity is full, a booking is placed on the waitlist; when a confirmed member
cancels, the first waitlisted member is promoted. Cancelled bookings may be
reactivated by booking again if the class is still open.

## Trainer directory and self-assignment

- `GET /api/trainers`
- `GET /api/trainers/me/assignments`
- `POST /api/trainers/:trainerId/assign`
- `DELETE /api/trainers/me/assignments/:assignmentId`

Optional assignment body:

```json
{
  "notes": "Preferred training focus"
}
```

Members may assign themselves to an active trainer and end their own assignment.
Admin assignment operations are available under `/api/admin/member-trainer-assignments`.

## Backend setup

Run `npm run migrate` to create the trainer-assignment table before using trainer
assignment routes. Class booking uses the existing `classes`, `class_schedules`,
`class_bookings`, `subscriptions`, and `membership_plans` tables.

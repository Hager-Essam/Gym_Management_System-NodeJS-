import express from 'express';
import { protect, authorize } from '../../middleware/authMiddleware.js';
import { validateUUID, validatePagination } from '../../middleware/validators.js';
import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';
import { writeAuditLog } from '../../utils/auditLog.js';

const router = express.Router();
router.use(protect);

router.get('/classes', authorize('admin', 'manager'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, active } = req.query;
  const values = [];
  const filters = ['deleted_at IS NULL'];
  if (active !== undefined) { values.push(active === 'true'); filters.push(`is_active=$${values.length}`); }
  const offset = (Number(page)-1)*Number(limit);
  values.push(Number(limit), offset);
  const result = await query(
    `SELECT * FROM classes WHERE ${filters.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,
    values
  );
  const countValues = values.slice(0, -2);
  const count = await query(`SELECT COUNT(*) FROM classes WHERE ${filters.join(' AND ')}`, countValues);
  res.json({ success:true, data:{ classes:result.rows, pagination:{currentPage:Number(page),totalPages:Math.ceil(Number(count.rows[0].count)/Number(limit)),totalRecords:Number(count.rows[0].count),limit:Number(limit)} } });
}));

router.post('/classes', authorize('admin'), asyncHandler(async (req,res) => {
  const { name,description,classType,difficultyLevel,durationMinutes,capacity,room,requiredPlanLevel,requiresBooking=true,bookingDeadlineHours=2,isActive=true,imageUrl }=req.body;
  if (!name || !durationMinutes || !capacity) throw new AppError('Name, duration, and capacity are required',400);
  if (durationMinutes<=0 || capacity<=0) throw new AppError('Duration and capacity must be positive',400);
  const result=await query(
    `INSERT INTO classes(name,description,class_type,difficulty_level,duration_minutes,capacity,room,required_plan_level,requires_booking,booking_deadline_hours,is_active,image_url)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [name,description||null,classType||null,difficultyLevel||null,durationMinutes,capacity,room||null,requiredPlanLevel||null,requiresBooking,bookingDeadlineHours,isActive,imageUrl||null]
  );
  await writeAuditLog({actorId:req.user.id,action:'class.created',entityType:'class',entityId:result.rows[0].id});
  res.status(201).json({success:true,data:{class:result.rows[0]}});
}));

router.patch('/classes/:id/status', validateUUID, authorize('admin'), asyncHandler(async (req,res)=>{
  if(typeof req.body.isActive!=='boolean') throw new AppError('isActive must be a boolean',400);
  const result=await query(
    `UPDATE classes SET is_active=$1,updated_at=NOW()
     WHERE id=$2 AND deleted_at IS NULL
     RETURNING *`,
    [req.body.isActive,req.params.id]
  );
  if(!result.rows.length) throw new AppError('Class not found',404);
  await writeAuditLog({actorId:req.user.id,action:'class.status_changed',entityType:'class',entityId:req.params.id,metadata:{isActive:req.body.isActive}});
  res.json({success:true,data:{class:result.rows[0]}});
}));

router.put('/classes/:id', validateUUID, authorize('admin'), asyncHandler(async (req,res) => {
  const fields={name:'name',description:'description',classType:'class_type',difficultyLevel:'difficulty_level',durationMinutes:'duration_minutes',capacity:'capacity',room:'room',requiredPlanLevel:'required_plan_level',requiresBooking:'requires_booking',bookingDeadlineHours:'booking_deadline_hours',isActive:'is_active',imageUrl:'image_url'};
  const updates=[]; const values=[]; let index=1;
  for (const [key,column] of Object.entries(fields)) {
    if (req.body[key] !== undefined) { updates.push(`${column}=$${index++}`); values.push(req.body[key]); }
  }
  if (!updates.length) throw new AppError('No fields to update',400);
  values.push(req.params.id);
  const result=await query(`UPDATE classes SET ${updates.join(',')},updated_at=NOW() WHERE id=$${index} AND deleted_at IS NULL RETURNING *`,values);
  if(!result.rows.length) throw new AppError('Class not found',404);
  res.json({success:true,data:{class:result.rows[0]}});
}));

router.delete('/classes/:id', validateUUID, authorize('admin'), asyncHandler(async (req,res)=>{
  const bookings=await query(`SELECT 1 FROM class_schedules cs JOIN class_bookings cb ON cb.schedule_id=cs.id WHERE cs.class_id=$1 LIMIT 1`,[req.params.id]);
  if(bookings.rows.length) {
    await query(`UPDATE classes SET is_active=false,deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`,[req.params.id]);
    return res.json({success:true,message:'Class deactivated because it has historical bookings'});
  }
  await query(`UPDATE classes SET is_active=false,deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`,[req.params.id]);
  res.json({success:true,message:'Class deleted successfully'});
}));

router.get('/class-schedules', authorize('admin','manager'), validatePagination, asyncHandler(async (req,res)=>{
  const {date,trainerId,classId,page=1,limit=20}=req.query;
  const filters=[]; const values=[];
  if(date){values.push(date);filters.push(`cs.scheduled_date=$${values.length}`)}
  if(trainerId){values.push(trainerId);filters.push(`cs.trainer_id=$${values.length}`)}
  if(classId){values.push(classId);filters.push(`cs.class_id=$${values.length}`)}
  const offset=(Number(page)-1)*Number(limit); values.push(Number(limit),offset);
  const result=await query(
    `SELECT cs.*,c.name AS class_name,u.full_name AS trainer_name,
      (SELECT COUNT(*) FROM class_bookings cb WHERE cb.schedule_id=cs.id AND cb.booking_status IN ('confirmed','attended')) AS booking_count
     FROM class_schedules cs JOIN classes c ON c.id=cs.class_id
     LEFT JOIN users u ON u.id=cs.trainer_id
     ${filters.length?`WHERE ${filters.join(' AND ')}`:''}
     ORDER BY cs.scheduled_date DESC,cs.start_time DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
  res.json({success:true,data:{schedules:result.rows,pagination:{currentPage:Number(page),limit:Number(limit)}}});
}));

router.post('/class-schedules', authorize('admin'), asyncHandler(async (req,res)=>{
  const {classId,trainerId,scheduledDate,startTime,endTime,status='scheduled',notes}=req.body;
  if(!classId||!scheduledDate||!startTime||!endTime) throw new AppError('Class, date, start time, and end time are required',400);
  if(endTime<=startTime) throw new AppError('End time must be after start time',400);
  if(trainerId){
    const trainer=await query(`SELECT id FROM users WHERE id=$1 AND role='trainer' AND status='active' AND deleted_at IS NULL`,[trainerId]);
    if(!trainer.rows.length) throw new AppError('Trainer not found or inactive',400);
  }
  const result=await transaction(async client=>{
    const conflict=await client.query(
      `SELECT id FROM class_schedules
       WHERE trainer_id=$1 AND scheduled_date=$2 AND status NOT IN ('cancelled')
         AND start_time<$4 AND end_time>$3`,
      [trainerId,scheduledDate,startTime,endTime]
    );
    if(conflict.rows.length) throw new AppError('Trainer has a conflicting schedule',409);
    return (await client.query(
      `INSERT INTO class_schedules(class_id,trainer_id,scheduled_date,start_time,end_time,status,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [classId,trainerId||null,scheduledDate,startTime,endTime,status,notes||null]
    )).rows[0];
  });
  await writeAuditLog({actorId:req.user.id,action:'class_schedule.created',entityType:'class_schedule',entityId:result.id,metadata:{classId,trainerId,scheduledDate}});
  res.status(201).json({success:true,data:{schedule:result}});
}));

router.patch('/class-schedules/:id/status', validateUUID, authorize('admin'), asyncHandler(async(req,res)=>{
  const {status,cancellationReason}=req.body;
  if(!['scheduled','in_progress','completed','cancelled'].includes(status)) throw new AppError('Invalid schedule status',400);
  const result=await query(
    `UPDATE class_schedules
     SET status=$1,cancellation_reason=$2,updated_at=NOW()
     WHERE id=$3
     RETURNING *`,
    [status,status==='cancelled'?(cancellationReason||null):null,req.params.id]
  );
  if(!result.rows.length) throw new AppError('Schedule not found',404);
  if(status==='cancelled'){
    await query(
      `UPDATE class_bookings SET booking_status='cancelled',cancelled_at=NOW(),
              cancellation_reason=$1,updated_at=NOW()
       WHERE schedule_id=$2 AND booking_status IN ('confirmed','waitlisted')`,
      [cancellationReason||'Schedule cancelled',req.params.id]
    );
  }
  await writeAuditLog({actorId:req.user.id,action:'class_schedule.status_changed',entityType:'class_schedule',entityId:req.params.id,metadata:{status,cancellationReason}});
  res.json({success:true,data:{schedule:result.rows[0]}});
}));

router.delete('/class-schedules/:id', validateUUID, authorize('admin'), asyncHandler(async(req,res)=>{
  const {reason}=req.body||{};
  const result=await query(
    `UPDATE class_schedules SET status='cancelled',cancellation_reason=$1,updated_at=NOW()
     WHERE id=$2 AND status<> 'cancelled'
     RETURNING *`,
    [reason||'Schedule cancelled',req.params.id]
  );
  if(!result.rows.length) throw new AppError('Active schedule not found',404);
  await query(
    `UPDATE class_bookings SET booking_status='cancelled',cancelled_at=NOW(),
            cancellation_reason=$1,updated_at=NOW()
     WHERE schedule_id=$2 AND booking_status IN ('confirmed','waitlisted')`,
    [reason||'Schedule cancelled',req.params.id]
  );
  await writeAuditLog({actorId:req.user.id,action:'class_schedule.cancelled',entityType:'class_schedule',entityId:req.params.id,metadata:{reason}});
  res.json({success:true,message:'Schedule cancelled successfully',data:{schedule:result.rows[0]}});
}));

router.put('/class-schedules/:id', validateUUID, authorize('admin'), asyncHandler(async(req,res)=>{
  const allowed={trainerId:'trainer_id',scheduledDate:'scheduled_date',startTime:'start_time',endTime:'end_time',status:'status',notes:'notes',cancellationReason:'cancellation_reason'};
  const updates=[];const values=[];let index=1;
  for(const [key,column] of Object.entries(allowed)){if(req.body[key]!==undefined){updates.push(`${column}=$${index++}`);values.push(req.body[key]);}}
  if(!updates.length) throw new AppError('No fields to update',400);
  values.push(req.params.id);
  const result=await query(`UPDATE class_schedules SET ${updates.join(',')},updated_at=NOW() WHERE id=$${index} RETURNING *`,values);
  if(!result.rows.length) throw new AppError('Schedule not found',404);
  res.json({success:true,data:{schedule:result.rows[0]}});
}));

router.get('/class-bookings', authorize('admin','manager'), validatePagination, asyncHandler(async(req,res)=>{
  const {scheduleId,memberId,status}=req.query;
  const filters=[];const values=[];let index=1;
  if(scheduleId){filters.push(`cb.schedule_id=$${index++}`);values.push(scheduleId);}
  if(memberId){filters.push(`cb.user_id=$${index++}`);values.push(memberId);}
  if(status){filters.push(`cb.booking_status=$${index++}`);values.push(status);}
  const result=await query(
    `SELECT cb.*,u.full_name AS member_name,u.email AS member_email,
            cs.scheduled_date,cs.start_time,cs.end_time,c.name AS class_name
     FROM class_bookings cb
     JOIN users u ON u.id=cb.user_id
     JOIN class_schedules cs ON cs.id=cb.schedule_id
     JOIN classes c ON c.id=cs.class_id
     ${filters.length?`WHERE ${filters.join(' AND ')}`:''}
     ORDER BY cs.scheduled_date DESC,cs.start_time DESC,cb.created_at DESC
     LIMIT 100`,
    values
  );
  res.json({success:true,data:{bookings:result.rows}});
}));

router.post('/class-bookings', authorize('admin','manager'), asyncHandler(async(req,res)=>{
  const {scheduleId,memberId}=req.body;
  if(!scheduleId||!memberId) throw new AppError('Schedule ID and member ID are required',400);
  const booking=await transaction(async client=>{
    const schedule=await client.query(
      `SELECT cs.id,cs.status,c.capacity
       FROM class_schedules cs JOIN classes c ON c.id=cs.class_id
       WHERE cs.id=$1 FOR UPDATE`,
      [scheduleId]
    );
    if(!schedule.rows.length) throw new AppError('Schedule not found',404);
    if(schedule.rows[0].status==='cancelled') throw new AppError('Cannot book a cancelled schedule',400);
    const member=await client.query(
      `SELECT id,status FROM users WHERE id=$1 AND role='member' AND deleted_at IS NULL`,
      [memberId]
    );
    if(!member.rows.length||member.rows[0].status!=='active') throw new AppError('Active member not found',404);
    const existing=await client.query(
      `SELECT id FROM class_bookings WHERE schedule_id=$1 AND user_id=$2`,
      [scheduleId,memberId]
    );
    if(existing.rows.length) throw new AppError('Member already has a booking for this schedule',409);
    const confirmed=await client.query(
      `SELECT COUNT(*) FROM class_bookings
       WHERE schedule_id=$1 AND booking_status='confirmed'`,
      [scheduleId]
    );
    const waitlistCount=await client.query(
      `SELECT COUNT(*) FROM class_bookings
       WHERE schedule_id=$1 AND booking_status='waitlisted'`,
      [scheduleId]
    );
    const isFull=Number(confirmed.rows[0].count)>=schedule.rows[0].capacity;
    const bookingStatus=isFull?'waitlisted':'confirmed';
    const waitlistPosition=isFull?Number(waitlistCount.rows[0].count)+1:null;
    const result=await client.query(
      `INSERT INTO class_bookings(schedule_id,user_id,booking_status,waitlist_position)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [scheduleId,memberId,bookingStatus,waitlistPosition]
    );
    return result.rows[0];
  });
  await writeAuditLog({actorId:req.user.id,action:'class_booking.created',entityType:'class_booking',entityId:booking.id,metadata:{scheduleId,memberId,status:booking.booking_status}});
  res.status(201).json({success:true,data:{booking}});
}));

router.patch('/class-bookings/:id/status', validateUUID, authorize('admin','manager'), asyncHandler(async(req,res)=>{
  const {status,cancellationReason}=req.body;
  if(!['confirmed','waitlisted','cancelled','attended','no_show'].includes(status)) throw new AppError('Invalid booking status',400);
  const result=await transaction(async client=>{
    const current=await client.query(
      `SELECT * FROM class_bookings WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    );
    if(!current.rows.length) throw new AppError('Booking not found',404);
    const booking=current.rows[0];
    let waitlistPosition=null;
    if(status==='waitlisted'){
      const waitlist=await client.query(
        `SELECT COUNT(*) FROM class_bookings WHERE schedule_id=$1 AND booking_status='waitlisted'`,
        [booking.schedule_id]
      );
      waitlistPosition=Number(waitlist.rows[0].count)+1;
    }
    const updated=await client.query(
      `UPDATE class_bookings
       SET booking_status=$1,waitlist_position=$2,
           cancelled_at=CASE WHEN $1='cancelled' THEN NOW() ELSE cancelled_at END,
           cancellation_reason=CASE WHEN $1='cancelled' THEN $3 ELSE cancellation_reason END,
           attended_at=CASE WHEN $1='attended' THEN NOW() ELSE attended_at END,
           updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [status,waitlistPosition,cancellationReason||null,req.params.id]
    );
    return updated.rows[0];
  });
  await writeAuditLog({actorId:req.user.id,action:'class_booking.status_changed',entityType:'class_booking',entityId:req.params.id,metadata:{status,cancellationReason}});
  res.json({success:true,data:{booking:result}});
}));

router.delete('/class-bookings/:id', validateUUID, authorize('admin','manager'), asyncHandler(async(req,res)=>{
  const {reason}=req.body||{};
  const result=await query(
    `UPDATE class_bookings SET booking_status='cancelled',cancelled_at=NOW(),
            cancellation_reason=$1,waitlist_position=NULL,updated_at=NOW()
     WHERE id=$2 AND booking_status IN ('confirmed','waitlisted')
     RETURNING *`,
    [reason||'Booking cancelled',req.params.id]
  );
  if(!result.rows.length) throw new AppError('Active booking not found',404);
  await writeAuditLog({actorId:req.user.id,action:'class_booking.cancelled',entityType:'class_booking',entityId:req.params.id,metadata:{reason}});
  res.json({success:true,message:'Booking cancelled successfully',data:{booking:result.rows[0]}});
}));

export default router;

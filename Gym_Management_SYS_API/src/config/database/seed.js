import bcrypt from 'bcrypt';
import { query, transaction } from '../config/database.js';

async function seed() {
  try {
    console.log('🌱 Starting database seeding...');

    await transaction(async (client) => {
      // 1. Create membership plans
      console.log('📦 Creating membership plans...');
      const plans = [
        {
          tier: 'Tier 01',
          name: 'Open Gym Core',
          description: '24/7 access to all equipment',
          price: 79,
          duration: 'monthly',
          features: JSON.stringify(['24/7 access', 'Equipment access', 'Mobile app', 'Locker room']),
          accessLevel: 'basic',
          displayOrder: 1,
          colorCode: '#10b981',
        },
        {
          tier: 'Tier 02',
          name: 'CrossFit & Cond.',
          description: 'Includes unlimited classes',
          price: 129,
          duration: 'monthly',
          features: JSON.stringify(['All Tier 01 features', 'Unlimited classes', 'Trainer support', 'Nutrition guide']),
          accessLevel: 'premium',
          maxClasses: null,
          displayOrder: 2,
          colorCode: '#3b82f6',
        },
        {
          tier: 'Tier 03',
          name: 'Black Diamond VIP',
          description: 'Premium all-access membership',
          price: 199,
          duration: 'monthly',
          features: JSON.stringify(['All Tier 02 features', 'Personal training (2 sessions/month)', 'Sauna & pool access', 'Priority booking', 'Guest passes']),
          accessLevel: 'vip',
          maxClasses: null,
          includesPersonalTraining: true,
          includesSauna: true,
          includesPool: true,
          displayOrder: 3,
          colorCode: '#8b5cf6',
        },
      ];

      const planIds = [];
      for (const plan of plans) {
        const result = await client.query(
          `INSERT INTO membership_plans (
            tier, name, description, price, duration, features, access_level,
            max_classes, includes_personal_training, includes_sauna, includes_pool,
            is_active, is_visible, display_order, color_code, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, true, $12, $13, NOW())
          RETURNING id`,
          [
            plan.tier, plan.name, plan.description, plan.price, plan.duration,
            plan.features, plan.accessLevel, plan.maxClasses || null,
            plan.includesPersonalTraining || false, plan.includesSauna || false,
            plan.includesPool || false, plan.displayOrder, plan.colorCode
          ]
        );
        planIds.push(result.rows[0].id);
      }
      console.log(`✅ Created ${plans.length} membership plans`);

      // 2. Create users
      console.log('👥 Creating users...');
      const password = await bcrypt.hash('password123', 12);
      
      const users = [
        {
          email: 'admin@ironforge.com',
          fullName: 'System Administrator',
          role: 'admin',
          phone: '+1234567890',
        },
        {
          email: 'manager@ironforge.com',
          fullName: 'Operations Manager',
          role: 'manager',
          phone: '+1234567891',
        },
        {
          email: 'coach@ironforge.com',
          fullName: 'Sarah Williams',
          role: 'coach',
          phone: '+1234567892',
          specializations: ['CrossFit', 'Strength Training', 'Nutrition'],
          certifications: ['NASM-CPT', 'CrossFit Level 1'],
          hourlyRate: 75.00,
        },
        {
          email: 'john@ironforge.com',
          fullName: 'John Doe',
          role: 'member',
          phone: '+1234567893',
          dateOfBirth: '1990-01-15',
          gender: 'male',
          address: '123 Main St, City, State 12345',
          emergencyContact: 'Jane Doe - +1234567894',
        },
        {
          email: 'emma@ironforge.com',
          fullName: 'Emma Johnson',
          role: 'member',
          phone: '+1234567895',
          dateOfBirth: '1992-05-20',
          gender: 'female',
          address: '456 Oak Ave, City, State 12345',
          emergencyContact: 'Michael Johnson - +1234567896',
        },
      ];

      const userIds = [];
      for (const user of users) {
        const result = await client.query(
          `INSERT INTO users (
            email, password_hash, full_name, role, phone, date_of_birth, gender,
            address, emergency_contact, specializations, certifications, hourly_rate,
            status, email_verified, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', true, NOW())
          RETURNING id, role`,
          [
            user.email, password, user.fullName, user.role, user.phone || null,
            user.dateOfBirth || null, user.gender || null, user.address || null,
            user.emergencyContact || null, user.specializations || null,
            user.certifications || null, user.hourlyRate || null
          ]
        );
        userIds.push({ id: result.rows[0].id, role: result.rows[0].role });
      }
      console.log(`✅ Created ${users.length} users`);

      // 3. Create subscriptions for members
      console.log('📝 Creating subscriptions...');
      const members = userIds.filter(u => u.role === 'member');
      
      for (let i = 0; i < members.length; i++) {
        const planId = planIds[i % planIds.length]; // Assign different plans
        await client.query(
          `INSERT INTO subscriptions (
            user_id, plan_id, start_date, end_date, status, payment_method,
            payment_frequency, amount, auto_renew, next_billing_date, created_at
          ) VALUES (
            $1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month',
            'active', 'card', 'monthly', (SELECT price FROM membership_plans WHERE id = $2),
            true, CURRENT_DATE + INTERVAL '1 month', NOW()
          )`,
          [members[i].id, planId]
        );
      }
      console.log(`✅ Created ${members.length} subscriptions`);

      // 4. Create sample payments
      console.log('💳 Creating sample payments...');
      for (const member of members) {
        await client.query(
          `INSERT INTO payments (
            user_id, amount, currency, payment_method, payment_type, status,
            transaction_id, invoice_number, description, processed_at, created_at
          ) VALUES (
            $1, 79.00, 'USD', 'card', 'subscription', 'completed',
            'TXN-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 12),
            'INV-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 10),
            'Monthly membership payment', NOW(), NOW()
          )`,
          [member.id]
        );
      }
      console.log(`✅ Created ${members.length} payments`);

      // 5. Create sample attendance records
      console.log('📊 Creating attendance records...');
      for (const member of members) {
        // Create 5 attendance records per member
        for (let i = 0; i < 5; i++) {
          await client.query(
            `INSERT INTO attendance (
              user_id, check_in_time, check_out_time, location, subscription_valid,
              access_granted, created_at
            ) VALUES (
              $1, NOW() - INTERVAL '${i + 1} days' - INTERVAL '2 hours',
              NOW() - INTERVAL '${i + 1} days', 'Main Gate', true, true, NOW()
            )`,
            [member.id]
          );
        }
      }
      console.log(`✅ Created ${members.length * 5} attendance records`);
    });

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Test Credentials:');
    console.log('   Admin:   admin@ironforge.com / password123');
    console.log('   Manager: manager@ironforge.com / password123');
    console.log('   Coach:   coach@ironforge.com / password123');
    console.log('   Member:  john@ironforge.com / password123');
    console.log('   Member:  emma@ironforge.com / password123');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run seeding
seed().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});

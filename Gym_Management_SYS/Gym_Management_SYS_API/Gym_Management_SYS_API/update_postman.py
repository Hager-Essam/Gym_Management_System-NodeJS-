import json

# Read the collection
with open(r'e:\OneDrive\OneDrive - EL-Minia University - Students\Desktop\NodeJs\Gym_Management_SYS_API\Gym_Management_SYS_API\IronForge-Gym-API.postman_collection.json', 'r', encoding='utf-8') as f:
    collection = json.load(f)

# Update Create Plan request
for folder in collection['item']:
    if folder['name'] == 'Membership Plans':
        for req in folder['item']:
            if req['name'] == 'Create Plan (Admin)':
                req['request']['body']['raw'] = '''{
  "name": "Premium Monthly",
  "description": "Premium membership with full access",
  "price": 299.99,
  "duration": "monthly",
  "features": ["Unlimited gym access", "Group classes", "Locker room", "Mobile app", "Guest passes"],
  "accessLevel": "premium",
  "maxClasses": 20,
  "includesPersonalTraining": false,
  "isActive": true,
  "isVisible": true
}'''

# Update member profile update to include gender validation
for folder in collection['item']:
    if folder['name'] == 'Members':
        for req in folder['item']:
            if req['name'] == 'Update My Profile':
                req['request']['body']['raw'] = '''{
  "fullName": "John Smith Updated",
  "phone": "+1234567890",
  "address": "123 Updated Street, City, State 12345",
  "dateOfBirth": "1990-05-15",
  "gender": "male",
  "emergencyContact": "Jane Doe - +0987654321",
  "bio": "Fitness enthusiast"
}'''

# Save back
with open(r'e:\OneDrive\OneDrive - EL-Minia University - Students\Desktop\NodeJs\Gym_Management_SYS_API\Gym_Management_SYS_API\IronForge-Gym-API.postman_collection.json', 'w', encoding='utf-8') as f:
    json.dump(collection, f, indent='\t', ensure_ascii=False)

print('Postman collection updated successfully')

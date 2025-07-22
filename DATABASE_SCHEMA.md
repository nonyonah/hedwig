# Database Schema

## Freelancers

| Column         | Type         | Description                                      |
|----------------|--------------|--------------------------------------------------|
| id             | `uuid`       | Unique identifier for the freelancer (Primary Key) |
| user_id        | `uuid`       | Foreign key to the `users` table                 |
| whatsapp_number| `varchar`    | Freelancer's WhatsApp number                     |
| skills         | `text[]`     | Array of freelancer's skills                     |
| experience     | `text`       | Description of freelancer's experience           |
| portfolio      | `text[]`     | Array of links to portfolio items                |
| created_at     | `timestamptz`| Timestamp of when the profile was created        |
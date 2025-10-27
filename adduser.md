docker exec -it medusa-kk0go4ws00kowo000sgkw880-3c6a47f95a82 \
 sh -lc "cd /server && npx medusa user \
 --email ttworldhungary@outlook.com \
 --password 'Mohi1412'"
# S3 CORS Configuration

```
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": [
      "https://admin.teherguminet.hu",
      "https://medusa-server-teherguminet.s3.us-east-2.amazonaws.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

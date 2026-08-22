output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "distribution_domain" {
  description = "URL *.cloudfront.net p/ validação pré-cutover (C8 da revisão)"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

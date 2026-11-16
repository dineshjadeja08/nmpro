# Customer catalogue API

Public endpoints used by the home page, category page and quick view popup. All prices are integers in paise.

## Location (optional on every endpoint below)

| Query | Meaning |
| --- | --- |
| `zone_id=<uuid>` | Price packages for this active zone. |
| `pincode=600020` (or `postal_code`) | Same, resolving the zone by 6-digit PIN. |

An unknown or malformed zone is ignored (prices fall back to "from" prices) so stale browser locations never break a page.

## Package price fields

| Field | With a zone | Without a zone |
| --- | --- | --- |
| `price_paise` | That zone's active price, or `null` if not priced there | Lowest active price in any zone |
| `mrp_paise` | `ServicePackage.original_price_paise` if it is above `price_paise`, else `null` | same |
| `discount_percent` | Rounded % off the MRP, or `null` | same |
| `price_is_from` | `false` | `true` when zones have different prices |
| `is_available_in_zone` | `true` / `false` | `null` |

The price is `base + inspection + fee + tax` of the active `PricingRule`, the same total the checkout quote starts from. `starting_price_paise` / `starting_mrp_paise` / `starting_discount_percent` on a service describe its cheapest package.

## Endpoints

| Endpoint | Use |
| --- | --- |
| `GET /api/v1/service-categories/` | Category grid; each category has `icon_url`. |
| `GET /api/v1/services/?popular=true&limit=4` | Home page popular services: `is_popular` first, then `is_featured`, then `sort_order`. Default 4, max 12. |
| `GET /api/v1/services/?category=<slug>&q=<text>&limit=<n>` | Filtered service list (max 100). |
| `GET /api/v1/service-categories/<slug>/` | Category page: `category`, every active sub-service (`services`) with prices, ratings and brands, and the category `faqs`. |
| `GET /api/v1/services/<slug>/` | Quick view in one call: images, packages with prices, `description`, `inclusions` / `exclusions` (falling back to the first package's lists), `average_rating`, `review_count`, `rating_breakdown`, `recent_reviews` (5) and `brands`. Old slugs redirect, keeping the query string. |
| `GET /api/v1/services/<id-or-slug>/reviews/` | Paginated reviews: `page`, `page_size` (default 10, max 50), `rating=1..5`, `with_comment=true`, `with_photo=true`. Returns `count`, `next`, `previous`, `rating_breakdown`. |
| `POST /api/v1/cart/merge/` (signed in) | Body `{"items": [{"service_id", "package_id"?, "quantity"?}]}`. Call right after OTP login to save the guest cart. Inactive items are returned in `skipped`; quantity is capped at 20, a cart holds at most 20 lines, and an item already in the cart takes the new quantity. |

Every service also carries `average_rating` (and the older `rating_avg`) and `review_count`, computed in the same query as the list.

## Review privacy

Reviewer names are shown as first name + last initial ("Priya S."), technicians by first name only. Phone numbers, emails and user IDs are never returned.

## Admin

- `PATCH /api/v1/admin/services/<id>/` accepts `brands`: at most 30, names 1–60 chars with no case-insensitive duplicates, logos empty or `https://`.
- `PATCH /api/v1/admin/packages/<id>/` accepts `original_price_paise` (the MRP) and `is_most_booked`.
- Category icons: `icon_url`, or upload to the `icon` slot of the category media endpoint (SVG, PNG, JPG or WebP).

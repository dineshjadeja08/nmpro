from django.db import migrations


DEFAULT_SPOTLIGHT = [
    ("AC service", "ac-service", "category:ac"),
    ("Handyman", "handyman", "popup:handyman"),
    ("Bathroom cleaning", "bathroom-cleaning", "service:bathroom-cleaning"),
    ("Washing machine", "washing-machine", "category:washing-machine"),
    ("Sofa cleaning", "sofa-cleaning", "category:sofa"),
    ("Kitchen cleaning", "kitchen-cleaning", "service:kitchen-cleaning"),
]


def seed_spotlight(apps, schema_editor):
    Banner = apps.get_model("catalog", "HomepageBanner")
    if Banner.objects.filter(placement="SPOTLIGHT").exists():
        return
    for order, (title, image, target) in enumerate(DEFAULT_SPOTLIGHT):
        Banner.objects.create(
            title=title,
            placement="SPOTLIGHT",
            desktop_image_url=f"https://nammapros.com/images/spotlight/{image}.webp",
            target_url=target,
            sort_order=order,
            is_active=True,
        )


class Migration(migrations.Migration):
    dependencies = [("catalog", "0016_alter_homepagebanner_placement")]
    operations = [migrations.RunPython(seed_spotlight, migrations.RunPython.noop)]

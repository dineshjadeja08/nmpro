from django.db import migrations, models


def enable_for_existing_verified(apps, schema_editor):
    """Technicians already approved and active keep access after this release."""
    TechnicianProfile = apps.get_model("technicians", "TechnicianProfile")
    TechnicianProfile.objects.filter(verification_status="VERIFIED", is_active=True).update(app_login_enabled=True)


class Migration(migrations.Migration):

    dependencies = [
        ("technicians", "0009_jobassignment_last_accuracy_m_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="technicianprofile",
            name="app_login_changed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="technicianprofile",
            name="app_login_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(enable_for_existing_verified, migrations.RunPython.noop),
    ]

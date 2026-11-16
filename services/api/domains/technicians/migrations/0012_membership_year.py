from datetime import timedelta

from django.db import migrations, models


def set_membership_end(apps, schema_editor):
    """Fees already paid or waived get a one-year membership from the payment date."""
    Fee = apps.get_model("technicians", "TechnicianJoiningFee")
    for fee in Fee.objects.filter(status__in=["PAID", "WAIVED"], paid_at__isnull=False, valid_until__isnull=True):
        fee.valid_until = fee.paid_at + timedelta(days=365)
        fee.save(update_fields=["valid_until"])


class Migration(migrations.Migration):

    dependencies = [
        ("technicians", "0011_partner_fee_and_data_rights"),
    ]

    operations = [
        migrations.AddField(
            model_name="technicianjoiningfee",
            name="valid_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(set_membership_end, migrations.RunPython.noop),
    ]

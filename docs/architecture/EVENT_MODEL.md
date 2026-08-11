# Event Model

WooCommerce sends signed, versioned envelopes to a raw inbox. Receipt validates signature, stores the payload and source identity, and acknowledges quickly. Workers normalize events and create idempotent business effects in transactions. Failed events are diagnosable, replayable, and reconciled against commerce source data.
